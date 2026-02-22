import * as http from 'http';
import moment from 'moment';
import { Server, Socket } from "socket.io";
import { DefaultEventsMap } from 'socket.io/dist/typed-events';
import ENV from '../glob/env';

type SocketIOConnection =  Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>

export class RealtimeService {
    io: Server
    sockets = new Map<string, SocketIOConnection>()
    binding = new Map<string, Set<string>>()
    revBinding = new Map<string, Set<string>>()

    onSocketDisconnected?: (socketId: string, bindingIds: Set<string>) => void
    onClientRequest?: (socketId: string, request: any) => Promise<void>

    init(server: http.Server) {
        this.io = new Server(server, {
            cors: {
                origin: '*'
            }
        })

        this.io.on('connection', (socket) => {
            this.setupNewConnection(socket)
        })

        console.log(`Socket IO initialized`)
    }

    setupNewConnection(socket: SocketIOConnection) {
        this.sockets.set(socket.id, socket)

        socket.on('disconnect', (reason) => {
            this.tearDownSocket(socket.id)
        })

        socket.on('message', (data) => {
            this.onClientRequest?.(socket.id, data)
        })

        socket.on('ping', (time) => {
            socket.emit('pong', time)
        })
    }

    private tearDownSocket(socketId: string) {
        const bindings = this.revBinding.get(socketId)
        this.revBinding.delete(socketId)
        this.sockets.delete(socketId)
        bindings?.forEach(id => this.binding.get(id)?.delete(socketId))

        try {
            this.onSocketDisconnected?.(socketId, bindings)
        }
        catch (err) {
            console.log(`onSocketDisconnected: error`)
            console.log(err)
        }
    }

    bind(id: string, socketId: string) {
        if (!this.binding.has(id)) {
            this.binding.set(id, new Set())
        }
        this.binding.get(id).add(socketId)
        
        if (!this.revBinding.has(socketId)) {
            this.revBinding.set(socketId, new Set())
        }
        this.revBinding.get(socketId).add(id)
    }

    getSocket(socketId: string) {
        if (!socketId) return null
        const socket = this.sockets.get(socketId)
        if (!socket || socket.disconnected) {
            this.tearDownSocket(socket.id)
            return null
        }
        return socket
    }

    getSocketsFromBinding(id: string) {
        const socketIds = this.binding.get(id)
        if (!socketIds || !socketIds.size) return []
        return [...socketIds].map(sid => this.getSocket(sid)).filter(s => !!s)
    }

    joinRoom(room: string, socketId: string) {
        const socket = this.getSocket(socketId)
        if (!socket) return
        socket.join(room)
    }

    roomBroadcast(room: string, key: string, msg: any) {
        if (!room || !key || !msg) return
        this.io.to(room).emit(key, msg, () => {
            console.log(moment().format('HH:mm:ss.SSS'), `Broadcasting ${key} to ${room} completed`)
        })
    }

    broadcast(key: string, msg: any) {
        if (!key || !msg) return
        this.io.emit(key, msg, () => {
            console.log(moment().format('HH:mm:ss.SSS'), `Broadcasting ${key} to everyone completed`)
        })
    }
}

export const RealtimeServ = new RealtimeService()
export default RealtimeServ
