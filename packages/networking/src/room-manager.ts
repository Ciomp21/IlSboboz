import type { LobbyMember, LobbyView } from '@ilsboboz/shared';

export interface RoomMember extends LobbyMember {
  readonly token: string;
}

export interface RoomManagerOptions {
  readonly roomCode?: string;
  readonly host: Omit<RoomMember, 'id' | 'token'> & { readonly id?: string; readonly token?: string };
  readonly maxPlayers?: number;
  readonly graceMs?: number;
  readonly onExpired?: (member: RoomMember) => void;
}

export interface JoinRequest {
  readonly token: string;
  readonly name: string;
  readonly avatar: string;
}

export class RoomManager {
  readonly roomCode: string;
  readonly hostId: string;
  private readonly maxPlayers: number;
  private readonly graceMs: number;
  private readonly onExpired?: (member: RoomMember) => void;
  private members: RoomMember[];
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private roomPhase: LobbyView['phase'] = 'lobby';

  constructor(options: RoomManagerOptions) {
    this.roomCode = options.roomCode ?? createRoomCode();
    this.maxPlayers = options.maxPlayers ?? 7;
    this.graceMs = options.graceMs ?? 15_000;
    this.onExpired = options.onExpired;
    this.hostId = options.host.id ?? 'host';
    const host: RoomMember = {
      ...options.host,
      id: this.hostId,
      token: options.host.token ?? createToken(),
      connected: true,
    };
    this.members = [host];
  }

  get phase(): LobbyView['phase'] {
    return this.roomPhase;
  }

  get host(): RoomMember {
    return this.members.find((member) => member.id === this.hostId)!;
  }

  get lobby(): LobbyView {
    return {
      roomCode: this.roomCode,
      hostId: this.hostId,
      phase: this.roomPhase,
      members: this.members.map((member) => ({
        id: member.id,
        name: member.name,
        kind: member.kind,
        avatar: member.avatar,
        ready: member.ready,
        connected: member.connected,
      })),
    };
  }

  join(request: JoinRequest): RoomMember {
    const existing = this.members.find((member) => member.token === request.token);
    if (existing) {
      this.clearGrace(existing.id);
      this.replaceMember(existing.id, { ...existing, name: normalizeName(request.name), avatar: request.avatar, connected: true });
      return this.member(existing.id);
    }
    if (this.roomPhase !== 'lobby') throw new Error('The game has already started.');
    if (this.members.length >= this.maxPlayers) throw new Error('The room is full.');
    const member: RoomMember = {
      id: `m${this.members.length + 1}`,
      token: request.token || createToken(),
      name: normalizeName(request.name),
      avatar: request.avatar || '🥷',
      kind: 'human',
      ready: false,
      connected: true,
    };
    this.members = [...this.members, member];
    return member;
  }

  setReady(memberId: string, ready: boolean): void {
    this.requireMember(memberId);
    if (memberId === this.hostId) throw new Error('The host does not need to be ready.');
    if (this.roomPhase !== 'lobby') throw new Error('Ready state is unavailable.');
    const member = this.member(memberId);
    this.replaceMember(memberId, { ...member, ready });
  }

  startGame(): void {
    if (this.roomPhase !== 'lobby') throw new Error('The room is not in the lobby.');
    const guests = this.members.filter((member) => member.id !== this.hostId && member.connected);
    if (guests.some((member) => !member.ready)) throw new Error('All connected players must be ready.');
    this.roomPhase = 'game';
  }

  disconnect(memberId: string): void {
    const member = this.member(memberId);
    if (memberId === this.hostId) throw new Error('Host migration is not supported.');
    this.replaceMember(memberId, { ...member, connected: false });
    this.clearGrace(memberId);
    const timer = setTimeout(() => {
      const current = this.members.find((entry) => entry.id === memberId);
      if (!current || current.connected) return;
      this.members = this.members.filter((entry) => entry.id !== memberId);
      this.onExpired?.(current);
    }, this.graceMs);
    this.timers.set(memberId, timer);
  }

  reconnect(token: string): RoomMember {
    const member = this.members.find((entry) => entry.token === token);
    if (!member) throw new Error('The reconnect token is invalid or expired.');
    this.clearGrace(member.id);
    this.replaceMember(member.id, { ...member, connected: true });
    return this.member(member.id);
  }

  close(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.members = [];
  }

  private member(id: string): RoomMember {
    const member = this.members.find((entry) => entry.id === id);
    if (!member) throw new Error('Unknown room member.');
    return member;
  }

  private requireMember(id: string): void {
    this.member(id);
  }

  private replaceMember(id: string, member: RoomMember): void {
    this.members = this.members.map((entry) => entry.id === id ? member : entry);
  }

  private clearGrace(memberId: string): void {
    const timer = this.timers.get(memberId);
    if (timer) clearTimeout(timer);
    this.timers.delete(memberId);
  }
}

function normalizeName(name: string): string {
  const value = name.trim().slice(0, 24);
  return value || 'Giocatore';
}

function createToken(): string {
  return `t${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function createRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let index = 0; index < 6; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
