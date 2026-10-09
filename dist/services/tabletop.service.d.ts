import { boardSchema, sceneSchema, tokenSchema, type MessageLog, type ParticipantRole as ParticipantRoleValue } from '@motor-vtt/contracts';
import { z } from 'zod';
import type { Pool } from 'mysql2/promise';
import type { DiceRollResult } from './dice-roller.js';
export declare const tokenCreateSchema: z.ZodObject<{
    assetOrigemId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    characterSheetId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    nome: z.ZodString;
    x: z.ZodNumber;
    y: z.ZodNumber;
    escala: z.ZodNumber;
    statusBarMap: z.ZodOptional<z.ZodNullable<z.ZodRecord<z.ZodString, z.ZodObject<{
        current: z.ZodString;
        maximum: z.ZodString;
        color: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>>>;
    customData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, z.core.$strict>;
type TokenCreateInput = z.infer<typeof tokenCreateSchema>;
type BoardData = z.infer<typeof boardSchema>;
type SceneData = z.infer<typeof sceneSchema>;
export type TabletopToken = z.infer<typeof tokenSchema>;
export interface TabletopState {
    v: 1;
    roomId: string;
    board: BoardData;
    scene: SceneData;
    tokens: TabletopToken[];
}
export interface RoomMembership {
    userId: string;
    role: ParticipantRoleValue;
}
export declare class TabletopService {
    private readonly database;
    constructor(database?: Pool);
    getRoomMembership(roomId: string, userId: string): Promise<RoomMembership>;
    getRecentMessages(roomId: string, userId: string): Promise<MessageLog[]>;
    createMessage(roomId: string, userId: string, content: string, roll?: DiceRollResult): Promise<MessageLog>;
    getInitialState(roomId: string, userId: string): Promise<TabletopState>;
    addToken(roomId: string, userId: string, input: TokenCreateInput): Promise<TabletopToken>;
    moveToken(roomId: string, userId: string, tokenId: string, x: number, y: number): Promise<TabletopToken>;
    removeToken(roomId: string, userId: string, tokenId: string): Promise<{
        id: string;
        sceneId: string;
    }>;
    private ensureDefaultScene;
    private requireMasterAndActiveScene;
    private getTokenInScene;
}
export declare const tabletopService: TabletopService;
export {};
//# sourceMappingURL=tabletop.service.d.ts.map