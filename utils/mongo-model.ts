import { Collection, CreateIndexesOptions, Db, IndexSpecification, Document, ObjectId } from 'mongodb';

export interface IMongoDocument {
    _id?: ObjectId;
    __v?: number;
}


export interface CollectionOptions {
    indexes?: {
        name: string
        index: IndexSpecification
        opts?: CreateIndexesOptions
    }[];
    dropIndexes?: string[]
    timeseries?: {
        name: string
        metaField: string
        timeField: string
        granularity: string
    }
}

export class MongoModel<T extends Document = Document> {
    public static SKIP_INDEX_MANAGEMENT: boolean = false;
    
    private _collection: Collection<T> | null = null;
    private _collectionName: string;
    private _options: CollectionOptions;
    private _proxy: any;

    constructor(collectionName: string, options: CollectionOptions) {
        this._collectionName = collectionName
        this._options = options;
        this._proxy = new Proxy(this, {
            get: (target, prop, receiver) => {
                if (prop in target && prop !== 'then') {
                    return Reflect.get(target, prop, receiver);
                }
                if (!target._collection) {
                    throw new Error('Collection not initialized. Call initCollection first.');
                }
                const value = Reflect.get(target._collection, prop);
                return typeof value === 'function' ? value.bind(target._collection) : value
            },
            set: (target, prop, value, receiver) => {
                if (prop in target) {
                    return Reflect.set(target, prop, value, receiver);
                }
                if (!target._collection) {
                    throw new Error('Collection not initialized. Call initCollection first.');
                }
                return Reflect.set(target._collection, prop, value);
            },
            has: (target, prop) => {
                return prop in target || (target._collection !== null && prop in target._collection);
            },
            ownKeys: (target) => {
                const ownKeys = Reflect.ownKeys(target);
                if (target._collection) {
                    return [...new Set([...ownKeys, ...Reflect.ownKeys(target._collection)])];
                }
                return ownKeys;
            },
            getOwnPropertyDescriptor: (target, prop) => {
                if (prop in target) {
                    return Reflect.getOwnPropertyDescriptor(target, prop);
                }
                if (target._collection) {
                    return Reflect.getOwnPropertyDescriptor(target._collection, prop);
                }
                return undefined;
            }
        });
        return this._proxy;
    }

    get schemaOptions(): CollectionOptions {
        return this._options;
    }

    private async getIndexSpecs() {
        try {
            return await this._collection.indexes()
        }
        catch {
            return []
        }
    }

    async initializeCollection(db: Db): Promise<void> {
        this._collection = db.collection<T>(this._collectionName);
        if (!MongoModel.SKIP_INDEX_MANAGEMENT) {
            await this.manageIndexes(db);
        }
    }

    private async manageIndexes(db: Db): Promise<void> {
        if (!this._collection || !this._options.indexes) return;

        const indexToCreate = this._options?.indexes ?? []
        const indexToDrop = this._options?.dropIndexes ?? []
        const indexes = await this.getIndexSpecs()
        const availIndexes = new Set(indexes.map(idx => idx.name ?? ''))

        // Drop indexes
        if (indexToDrop.length > 0) {
            for (const indexName of indexToDrop) {
                try {
                    if (!availIndexes.has(indexName)) continue
                    
                    await this._collection.dropIndex(indexName);
                } catch (error) {
                    console.warn(`Failed to drop index ${indexName} of collection ${this._collectionName}:`, error);
                }
            }
        }

        // Create indexes
        if (indexToCreate?.length > 0) {
            for (const index of indexToCreate) {
                try {
                    if (availIndexes.has(index.name)) continue

                    await this._collection.createIndex(index.index, {
                        ...index.opts,
                        name: index.name
                    })
                } catch (error) {
                    console.error(`Failed to create index ${index.name} of collection ${this._collectionName}:`, error);
                }
            }
        }

        // Create timeseries
        if (this._options.timeseries) {
            try {
                await this.initRecordTS(db, this._collectionName, this._options);
            } catch (error) {
                console.error(`Failed to initialize timeseries for collection ${this._collectionName}:`, error);
            }
        }
    }

    async initRecordTS(db: Db, collectionName: string, options: CollectionOptions) {
        const serverInfo = await db.admin().serverInfo()
        if (serverInfo.versionArray?.length && serverInfo.versionArray[0] as number >= 5) {
            // Check if the collection already exists as a time series
            const collections = await db.listCollections({ name: collectionName }).toArray();
            const existingCollection = collections.length > 0 ? collections[0] : null;
            if (existingCollection) {
                return;
            }

            await db.createCollection(collectionName, {
                timeseries: {
                    metaField: options.timeseries?.metaField,
                    timeField: options.timeseries?.timeField,
                    granularity: options.timeseries?.granularity
                }
            })
        }
        else {
            // For MongoDB versions below 5, use a simple index instead of timeseries
            await db.collection(collectionName).createIndex({
                [options.timeseries?.metaField]: 1,
                [options.timeseries?.timeField]: 1
            }, {
                name: options.timeseries.name,
                background: true
            });
        }
    }

    get collection(): Collection<T> {
        if (!this._collection) {
            throw new Error('Collection not initialized. Call initCollection first.');
        }
        return this._collection;
    }

    get configuredCollectionName() {
        return this._collectionName
    }

    private static collections: MongoModel<any>[] = []
    private static db: Db | null = null

    static createCollection<T extends Document>(collectionName: string, options: CollectionOptions): MongoModel<T> & Collection<T> {
        const collection = new MongoModel<T>(collectionName, options);
        this.collections.push(collection);
        if (this.db) {
            collection.initializeCollection(this.db).catch(console.error);
        }
        return <any> collection;
    }
    
    static async setDatabase(db: Db): Promise<void> {
        this.db = db
        await Promise.all(this.collections.map(collection => collection.initializeCollection(db)))
    }

    static getDatabase(): Db {
        if (!this.db) {
            throw new Error('Database not initialized. Call setDatabase first.');
        }
        return this.db;
    }

    static setSkipIndexManagement(skip: boolean): void {
        this.SKIP_INDEX_MANAGEMENT = skip;
    }
}