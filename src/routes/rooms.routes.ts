import { Router } from 'express';

import { createRoom, getRoom, joinRoom, listRooms } from '../controllers/rooms.controller.js';
import { validate } from '../http/validation.js';
import { authenticate } from '../middlewares/authenticate.js';
import { createRoomSchema, joinRoomSchema, roomIdParamsSchema } from './rooms.schemas.js';

const roomsRouter = Router();

roomsRouter.post('/', authenticate, validate({ body: createRoomSchema }), createRoom);
roomsRouter.get('/', authenticate, listRooms);
roomsRouter.post('/join', authenticate, validate({ body: joinRoomSchema }), joinRoom);
roomsRouter.get('/:salaId', authenticate, validate({ params: roomIdParamsSchema }), getRoom);

export default roomsRouter;
