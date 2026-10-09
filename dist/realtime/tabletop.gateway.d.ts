import type { Server as HttpServer } from 'node:http';
import { type MessageLog } from '@motor-vtt/contracts';
import { Server } from 'socket.io';
import { type TabletopState, type TabletopToken } from '../services/tabletop.service.js';
type SocketErrorCode = 'AUTH_REQUIRED' | 'INVALID_PAYLOAD' | 'ROOM_ACCESS_DENIED' | 'ROOM_NOT_JOINED' | 'ALREADY_JOINED' | 'MASTER_REQUIRED' | 'TOKEN_NOT_FOUND' | 'INVALID_DICE_EXPRESSION' | 'INTERNAL_ERROR';
interface SocketError {
    v: 1;
    code: SocketErrorCode;
    message: string;
}
interface OperationAck {
    v: 1;
    ok: boolean;
    error?: SocketError;
    token?: TabletopToken;
    tokenId?: string;
}
interface PresencePayload {
    v: 1;
    roomId: string;
    onlineUserIds: string[];
}
interface TabletopClientEvents {
    'tabletop:v1:join': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:message:send': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:add': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:move': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
    'tabletop:v1:token:remove': (payload: unknown, acknowledge?: (response: OperationAck) => void) => void;
}
interface TabletopServerEvents {
    'tabletop:v1:state': (state: TabletopState) => void;
    'tabletop:v1:messages': (payload: {
        v: 1;
        roomId: string;
        messages: MessageLog[];
    }) => void;
    'tabletop:v1:message:created': (payload: {
        v: 1;
        message: MessageLog;
    }) => void;
    'tabletop:v1:presence': (presence: PresencePayload) => void;
    'tabletop:v1:token:added': (payload: {
        v: 1;
        token: TabletopToken;
    }) => void;
    'tabletop:v1:token:moved': (payload: {
        v: 1;
        token: TabletopToken;
    }) => void;
    'tabletop:v1:token:removed': (payload: {
        v: 1;
        tokenId: string;
        sceneId: string;
    }) => void;
    'tabletop:v1:error': (error: SocketError) => void;
}
interface TabletopSocketData {
    userId: string;
    sessionId: string;
    accessTokenExpiresAt: number;
    roomId?: string;
}
export declare function createTabletopGateway(httpServer: HttpServer): Server<TabletopClientEvents, TabletopServerEvents, Record<string, never>, TabletopSocketData>;
export {};
//# sourceMappingURL=tabletop.gateway.d.ts.map