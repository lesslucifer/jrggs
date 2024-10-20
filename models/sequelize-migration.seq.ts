import { Table, Model, Column, PrimaryKey, AutoIncrement } from "sequelize-typescript";

@Table({ tableName: 'migration', timestamps: false })
export default class Migration extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column
    id: string;

    @Column
    name: string;

    @Column
    migratedAt: Date;
}