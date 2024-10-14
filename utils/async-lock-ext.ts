import AsyncLock from 'async-lock';
import { nanoid } from 'nanoid';

declare type Promisified<T> = T extends Promise<infer U> ? U : T;

export class AsyncLockExt {
    private asyncLock = new AsyncLock();

    async acquire(key: string, opts?: AsyncLock.AsyncLockOptions) {
        return new Promise<LockKey>((res, rej) => {
            const lockKey = new LockKey(this);
            return this.asyncLock.acquire(key, (done) => {
                lockKey.__done = done;
                res(lockKey);
            }, opts);
        })
    }

    async sync<R>(key: string, asyncHandler: () => Promisified<R>, opts?: AsyncLock.AsyncLockOptions) {
        let _key: LockKey;
        try {
            _key = await this.acquire(key, opts);
            return await Promise.resolve(asyncHandler());
        }
        catch (err) {
            throw err;
        }
        finally {
            _key && _key.unlock();
        }
    }
}

export class LockKey {
    nonce = nanoid()
    __done?: (err?: unknown, ret?: unknown) => any = undefined;

    constructor(public lock: AsyncLockExt) {}

    async unlock() {
        return this.__done && this.__done(undefined, undefined);
    }
}

export class SkipLock {
    private lockedKeys = new Set<string>();

    async sync(key: string, asyncHandler: () => Promise<any>) {
        if (this.lockedKeys.has(key)) return;

        try {
            this.lockedKeys.add(key);
            return await asyncHandler();
        }
        catch (err) {
            throw err;
        }
        finally {
            this.lockedKeys.delete(key);
        }
    }

    static sync(key: string, asyncHandler: () => Promise<any>) {
        return this.sync(key, asyncHandler);
    }
}

export const DEFAULT_LOCK = new AsyncLockExt()
export function Locked<Args extends any[], R>(keyF?: (args: Args, _this: any) => string, lock?: AsyncLockExt) {
    const _lock = lock ?? DEFAULT_LOCK
    return (target: any, key: PropertyKey, desc: TypedPropertyDescriptor<(...args: Args) => Promise<R>>) => {
        if (!target || !desc?.value) return
        const originalMethod = desc.value
        desc.value = function (...args: Args) {
            return _lock.sync(keyF?.(args, this) ?? '', () => originalMethod.apply(this, args))
        }
        return desc
    }
}

export default AsyncLockExt;