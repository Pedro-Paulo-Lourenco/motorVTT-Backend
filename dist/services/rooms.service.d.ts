import { type ParticipantInput, type RoomInput } from '@motor-vtt/contracts';
import type { Pool } from 'mysql2/promise';
export declare class RoomsService {
    private readonly database;
    private readonly inviteCodeGenerator;
    constructor(database?: Pool, inviteCodeGenerator?: () => string);
    createRoom(nome: string, userId: string, templateId?: string): Promise<RoomInput>;
    listRooms(userId: string): Promise<RoomInput[]>;
    joinRoom(codigoConvite: string, userId: string): Promise<ParticipantInput>;
    getRoomForParticipant(roomId: string, userId: string): Promise<{
        sala: RoomInput;
        participantes: ParticipantInput[];
    }>;
}
export declare const roomsService: RoomsService;
//# sourceMappingURL=rooms.service.d.ts.map