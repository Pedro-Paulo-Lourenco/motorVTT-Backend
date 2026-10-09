import type { Request, Response } from 'express';
import type { ParticipantInput, RoomInput } from '@motor-vtt/contracts';
import type { ApiResponse, ValidatedLocals } from '../http/types.js';
import type { CreateRoomBody, JoinRoomBody, RoomIdParams } from '../routes/rooms.schemas.js';
export declare function createRoom(req: Request, res: Response<ApiResponse<RoomInput>, ValidatedLocals<CreateRoomBody, undefined, undefined>>): Promise<void>;
export declare function listRooms(req: Request, res: Response<ApiResponse<RoomInput[]>>): Promise<void>;
export declare function joinRoom(req: Request, res: Response<ApiResponse<ParticipantInput>, ValidatedLocals<JoinRoomBody, undefined, undefined>>): Promise<void>;
export declare function getRoom(req: Request, res: Response<ApiResponse<{
    sala: RoomInput;
    participantes: ParticipantInput[];
}>, ValidatedLocals<undefined, undefined, RoomIdParams>>): Promise<void>;
//# sourceMappingURL=rooms.controller.d.ts.map