import { initializeApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  getDocs,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  arrayUnion,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

const SESS_UID_KEY = 'sic_cloud_uid';

export interface CloudSession {
  uid: string;
  name: string;
  role: 'player' | 'teacher';
  roomCode: string;
}

export interface CloudHooks {
  getDB: () => any;
  onAuth: (session: CloudSession | null) => void;
  onRemote: () => void;
  onStatus: (status: string) => void;
}

let hooks: CloudHooks | null = null;
let currentSession: CloudSession | null = null;
let ready = false;
let cloudStatus: 'idle' | 'syncing' | 'ok' | 'denied' | 'offline' = 'idle';
let unsubs: Unsubscribe[] = [];
const roomSubUnsubs = new Map<string, Unsubscribe[]>();
const fetchedLessons = new Set<string>();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentSession?.uid || null,
      email: null,
      emailVerified: null,
      isAnonymous: false,
      tenantId: null,
      providerInfo: [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

function setStatus(s: 'idle' | 'syncing' | 'ok' | 'denied' | 'offline') {
  cloudStatus = s;
  if (hooks?.onStatus) hooks.onStatus(s);
}

function clearSubscriptions() {
  unsubs.forEach((u) => {
    try {
      u();
    } catch {
      /* ignore */
    }
  });
  unsubs = [];
  roomSubUnsubs.forEach((arr) =>
    arr.forEach((u) => {
      try {
        u();
      } catch {
        /* ignore */
      }
    })
  );
  roomSubUnsubs.clear();
  fetchedLessons.clear();
}

function sanitizeName(name: string | null | undefined, fallback = 'ผู้เล่น'): string {
  const s = String(name || '').trim();
  return (s || fallback).slice(0, 80);
}

async function shaHex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function nameToUserId(username: string): Promise<string> {
  const norm = String(username || '').trim().toLowerCase();
  const hex = await shaHex('sic_user:' + norm);
  return 'u_' + hex.slice(0, 28);
}

async function hashPassword(uid: string, password: string): Promise<string> {
  return shaHex(uid + ':' + password);
}

function saveSessionUid(uid: string | null) {
  try {
    if (uid) localStorage.setItem(SESS_UID_KEY, uid);
    else localStorage.removeItem(SESS_UID_KEY);
  } catch {
    /* ignore */
  }
}

function getSavedSessionUid(): string | null {
  try {
    return localStorage.getItem(SESS_UID_KEY);
  } catch {
    return null;
  }
}

function sanitizeRoomForSave(room: any, ownerUid: string, ownerName: string) {
  const roster = Array.isArray(room.players)
    ? room.players.slice(0, 6).map((p: any) => ({
        id: String(p.id || '').slice(0, 64),
        name: sanitizeName(p.name, 'ผู้เล่น'),
        role: String(p.role || 'citizen'),
      }))
    : [];
  const log = Array.isArray(room.log) ? room.log.slice(-400) : [];
  const memberUids =
    Array.isArray(room.memberUids) && room.memberUids.length
      ? Array.from(new Set(room.memberUids.map(String))).slice(0, 30)
      : [ownerUid];
  return {
    code: String(room.code || '').toUpperCase().slice(0, 6),
    ownerUid: String(room.ownerUid || ownerUid).slice(0, 128),
    ownerName: sanitizeName(room.ownerName || room.owner || ownerName, 'ผู้ควบคุมเกม'),
    lessonId: String(room.lessonId || 'demo').slice(0, 64),
    status: room.status === 'playing' || room.status === 'ended' ? room.status : 'lobby',
    city: Math.max(0, Math.min(9999, Number(room.city ?? 100))),
    cityStart: Math.max(1, Math.min(9999, Number(room.cityStart ?? 100))),
    durationMin: Math.max(20, Math.min(600, Number(room.durationMin ?? 20))),
    startedAt: typeof room.startedAt === 'number' ? room.startedAt : null,
    endsAt: typeof room.endsAt === 'number' ? room.endsAt : null,
    endedAt: typeof room.endedAt === 'number' ? room.endedAt : null,
    endReason: room.endReason ? String(room.endReason).slice(0, 32) : null,
    winner: room.winner ? String(room.winner).slice(0, 64) : null,
    memberUids,
    roster,
    log,
    usedAudit: room.usedAudit && typeof room.usedAudit === 'object' ? room.usedAudit : {},
    usedHelp: room.usedHelp && typeof room.usedHelp === 'object' ? room.usedHelp : {},
    usedTrait: room.usedTrait && typeof room.usedTrait === 'object' ? room.usedTrait : {},
  };
}

function sanitizePlayerForSave(player: any, roomCode: string, ownerUid: string) {
  return {
    id: String(player.id || '').slice(0, 64),
    roomCode: String(roomCode || '').toUpperCase().slice(0, 6),
    ownerUid: String(ownerUid || '').slice(0, 128),
    claimedByUid: player.claimedByUid ? String(player.claimedByUid).slice(0, 128) : null,
    name: sanitizeName(player.name, 'ผู้เล่น'),
    role: String(player.role || 'citizen'),
    life: Math.max(-9999, Math.min(9999, Number(player.life ?? 0))),
    coop: Math.max(-9999, Math.min(9999, Number(player.coop ?? 0))),
    step: Math.max(0, Math.min(3, Number(player.step ?? 0))),
    pre: player.pre && typeof player.pre === 'object' ? player.pre : null,
    preScores: Array.isArray(player.preScores) ? player.preScores.slice(0, 30) : null,
    traitGame: player.traitGame && typeof player.traitGame === 'object' ? player.traitGame : {},
    post: player.post && typeof player.post === 'object' ? player.post : null,
  };
}

function mergeRemoteRoom(roomData: any) {
  if (!hooks || !roomData?.code) return;
  const DB = hooks.getDB();
  const code = String(roomData.code);
  const existing = DB.rooms[code] || { code, players: [], log: [] };
  const mergedPlayers = Array.isArray(existing.players) ? [...existing.players] : [];
  if (Array.isArray(roomData.roster) && roomData.roster.length && !mergedPlayers.length) {
    roomData.roster.forEach((rp: any) => {
      mergedPlayers.push({
        id: rp.id,
        name: rp.name,
        role: rp.role,
        life: 0,
        coop: 0,
        step: 0,
        pre: null,
        traitGame: {},
        evidence: {},
        post: null,
      });
    });
  }
  DB.rooms[code] = Object.assign({}, existing, {
    code,
    owner: roomData.ownerName || existing.owner || '',
    ownerUid: roomData.ownerUid,
    ownerName: roomData.ownerName,
    lessonId: roomData.lessonId || 'demo',
    status: roomData.status || 'lobby',
    city: roomData.city ?? 100,
    cityStart: roomData.cityStart ?? 100,
    durationMin: roomData.durationMin ?? 20,
    startedAt: roomData.startedAt ?? undefined,
    endsAt: roomData.endsAt ?? undefined,
    endedAt: roomData.endedAt ?? undefined,
    endReason: roomData.endReason ?? undefined,
    winner: roomData.winner ?? undefined,
    memberUids: Array.isArray(roomData.memberUids) ? roomData.memberUids : [],
    roster: Array.isArray(roomData.roster) ? roomData.roster : [],
    log: Array.isArray(roomData.log) ? roomData.log : [],
    usedAudit: roomData.usedAudit || {},
    usedHelp: roomData.usedHelp || {},
    usedTrait: roomData.usedTrait || {},
    createdAt:
      typeof roomData.createdAt?.toMillis === 'function'
        ? roomData.createdAt.toMillis()
        : typeof roomData.createdAt === 'number'
        ? roomData.createdAt
        : existing.createdAt || Date.now(),
    players: mergedPlayers,
  });
}

function ensureLessonLoaded(lessonId: string) {
  if (!lessonId || !hooks || fetchedLessons.has(lessonId)) return;
  fetchedLessons.add(lessonId);
  const path = `lessons/${lessonId}`;
  getDoc(doc(db, 'lessons', lessonId))
    .then((snap) => {
      if (!snap.exists() || !hooks) return;
      const data = snap.data();
      if (!data?.payload) return;
      const DB = hooks.getDB();
      const idx = DB.lessons.findIndex((l: any) => l.id === lessonId);
      if (idx >= 0) DB.lessons[idx] = data.payload;
      else DB.lessons.push(data.payload);
      hooks.onRemote();
    })
    .catch((err) => {
      fetchedLessons.delete(lessonId);
      if (String(err?.message || '').includes('permission')) {
        handleFirestoreError(err, OperationType.GET, path);
      }
    });
}

function attachRoomDetailListeners(code: string, roomOwnerUid: string, uid: string) {
  if (roomSubUnsubs.has(code) || !hooks) return;
  const arr: Unsubscribe[] = [];
  if (roomOwnerUid === uid) {
    const pPath = `rooms/${code}/players`;
    const pq = query(collection(db, 'rooms', code, 'players'), where('ownerUid', '==', uid));
    arr.push(
      onSnapshot(
        pq,
        (snap) => {
          if (!hooks) return;
          const DB = hooks.getDB();
          const room = DB.rooms[code];
          if (!room) return;
          const prevEvByPid: Record<string, any> = {};
          (room.players || []).forEach((p: any) => {
            if (p.evidence) prevEvByPid[p.id] = p.evidence;
          });
          const nextPlayers: any[] = [];
          snap.forEach((d) => {
            const pd = d.data();
            nextPlayers.push({
              id: pd.id,
              name: pd.name,
              role: pd.role,
              life: pd.life ?? 0,
              coop: pd.coop ?? 0,
              step: pd.step ?? 0,
              pre: pd.pre ?? null,
              preScores: pd.preScores ?? null,
              traitGame: pd.traitGame || {},
              post: pd.post ?? null,
              claimedByUid: pd.claimedByUid ?? null,
              evidence: prevEvByPid[pd.id] || {},
            });
          });
          room.players = nextPlayers;
          setStatus('ok');
          hooks.onRemote();
        },
        (error) => {
          setStatus('denied');
          handleFirestoreError(error, OperationType.LIST, pPath);
        }
      )
    );

    const ePath = `rooms/${code}/evidence`;
    const eq = query(collection(db, 'rooms', code, 'evidence'), where('ownerUid', '==', uid));
    arr.push(
      onSnapshot(
        eq,
        (snap) => {
          if (!hooks) return;
          const DB = hooks.getDB();
          const room = DB.rooms[code];
          if (!room) return;
          snap.forEach((d) => {
            const ed = d.data();
            const pl = (room.players || []).find((x: any) => x.id === ed.playerId);
            if (pl) {
              pl.evidence = pl.evidence || {};
              pl.evidence[ed.trait] = {
                img: ed.img,
                desc: ed.desc,
                ai: ed.ai,
                status: ed.status,
                at: ed.at,
              };
            }
          });
          setStatus('ok');
          hooks.onRemote();
        },
        (error) => {
          setStatus('denied');
          handleFirestoreError(error, OperationType.LIST, ePath);
        }
      )
    );
  } else {
    const pPath = `rooms/${code}/players`;
    const pq = query(collection(db, 'rooms', code, 'players'), where('claimedByUid', '==', uid));
    arr.push(
      onSnapshot(
        pq,
        (snap) => {
          if (!hooks) return;
          const DB = hooks.getDB();
          const room = DB.rooms[code];
          if (!room) return;
          snap.forEach((d) => {
            const pd = d.data();
            const idx = (room.players || []).findIndex((x: any) => x.id === pd.id);
            const prevEv = idx >= 0 && room.players[idx].evidence ? room.players[idx].evidence : {};
            const mapped = {
              id: pd.id,
              name: pd.name,
              role: pd.role,
              life: pd.life ?? 0,
              coop: pd.coop ?? 0,
              step: pd.step ?? 0,
              pre: pd.pre ?? null,
              preScores: pd.preScores ?? null,
              traitGame: pd.traitGame || {},
              post: pd.post ?? null,
              claimedByUid: pd.claimedByUid ?? null,
              evidence: prevEv,
            };
            if (idx >= 0) room.players[idx] = mapped;
            else room.players.push(mapped);
          });
          hooks.onRemote();
        },
        (error) => handleFirestoreError(error, OperationType.LIST, pPath)
      )
    );

    const ePath = `rooms/${code}/evidence`;
    const eq = query(collection(db, 'rooms', code, 'evidence'), where('authorUid', '==', uid));
    arr.push(
      onSnapshot(
        eq,
        (snap) => {
          if (!hooks) return;
          const DB = hooks.getDB();
          const room = DB.rooms[code];
          if (!room) return;
          snap.forEach((d) => {
            const ed = d.data();
            const pl = (room.players || []).find((x: any) => x.id === ed.playerId);
            if (pl) {
              pl.evidence = pl.evidence || {};
              pl.evidence[ed.trait] = {
                img: ed.img,
                desc: ed.desc,
                ai: ed.ai,
                status: ed.status,
                at: ed.at,
              };
            }
          });
          hooks.onRemote();
        },
        (error) => handleFirestoreError(error, OperationType.LIST, ePath)
      )
    );
  }
  roomSubUnsubs.set(code, arr);
}

function startListeners(session: CloudSession) {
  clearSubscriptions();
  if (!hooks) return;
  const uid = session.uid;

  const ownedQuery = query(collection(db, 'rooms'), where('ownerUid', '==', uid));
  unsubs.push(
    onSnapshot(
      ownedQuery,
      (snap) => {
        if (!hooks) return;
        snap.forEach((d) => {
          const data = d.data();
          mergeRemoteRoom(data);
          ensureLessonLoaded(data.lessonId);
          attachRoomDetailListeners(data.code, data.ownerUid, uid);
        });
        setStatus('ok');
        hooks.onRemote();
      },
      (error) => {
        setStatus('denied');
        handleFirestoreError(error, OperationType.LIST, 'rooms');
      }
    )
  );

  const memberQuery = query(collection(db, 'rooms'), where('memberUids', 'array-contains', uid));
  unsubs.push(
    onSnapshot(
      memberQuery,
      (snap) => {
        if (!hooks) return;
        snap.forEach((d) => {
          const data = d.data();
          mergeRemoteRoom(data);
          ensureLessonLoaded(data.lessonId);
          attachRoomDetailListeners(data.code, data.ownerUid, uid);
        });
        setStatus('ok');
        hooks.onRemote();
      },
      (error) => {
        setStatus('denied');
        handleFirestoreError(error, OperationType.LIST, 'rooms');
      }
    )
  );

  if (session.role === 'teacher') {
    const lessonQuery = query(collection(db, 'lessons'), where('ownerUid', '==', uid));
    unsubs.push(
      onSnapshot(
        lessonQuery,
        (snap) => {
          if (!hooks) return;
          const DB = hooks.getDB();
          snap.forEach((d) => {
            const data = d.data();
            if (!data?.payload) return;
            const idx = DB.lessons.findIndex((l: any) => l.id === data.id);
            if (idx >= 0) DB.lessons[idx] = data.payload;
            else DB.lessons.push(data.payload);
          });
          hooks.onRemote();
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'lessons')
      )
    );
  }
}

async function init(h: CloudHooks) {
  hooks = h;
  testConnection();
  const savedUid = getSavedSessionUid();
  if (!savedUid) {
    ready = true;
    setStatus('idle');
    if (hooks?.onAuth) hooks.onAuth(null);
    return;
  }
  setStatus('syncing');
  try {
    const snap = await getDoc(doc(db, 'users', savedUid));
    ready = true;
    if (!snap.exists()) {
      saveSessionUid(null);
      currentSession = null;
      setStatus('idle');
      if (hooks?.onAuth) hooks.onAuth(null);
      return;
    }
    const d = snap.data();
    const sess: CloudSession = {
      uid: d.uid,
      name: sanitizeName(d.name),
      role: d.role === 'teacher' ? 'teacher' : 'player',
      roomCode: String(d.roomCode || ''),
    };
    currentSession = sess;
    startListeners(sess);
    setStatus('ok');
    if (hooks?.onAuth) hooks.onAuth(sess);
  } catch (err) {
    ready = true;
    console.error(err);
    setStatus('offline');
    if (hooks?.onAuth) hooks.onAuth(null);
  }
}

async function registerWithName(username: string, password: string): Promise<CloudSession> {
  const cleanName = sanitizeName(username);
  const uid = await nameToUserId(cleanName);
  const pwHash = await hashPassword(uid, password);
  const ref = doc(db, 'users', uid);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }
  if (snap.exists()) throw new Error('USER_EXISTS');

  try {
    await setDoc(ref, {
      uid,
      name: cleanName,
      passwordHash: pwHash,
      role: 'player',
      roomCode: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
  }

  const sess: CloudSession = { uid, name: cleanName, role: 'player', roomCode: '' };
  currentSession = sess;
  saveSessionUid(uid);
  ready = true;
  startListeners(sess);
  setStatus('ok');
  return sess;
}

async function loginWithName(username: string, password: string, isTeacherCode = false): Promise<CloudSession> {
  const cleanName = sanitizeName(username);
  const uid = await nameToUserId(cleanName);
  const pwHash = await hashPassword(uid, password);
  const ref = doc(db, 'users', uid);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${uid}`);
  }

  let role: 'player' | 'teacher' = isTeacherCode ? 'teacher' : 'player';
  let displayName = cleanName;
  let roomCode = '';

  if (!snap.exists()) {
    if (!isTeacherCode) throw new Error('USER_NOT_FOUND');
    try {
      await setDoc(ref, {
        uid,
        name: cleanName,
        passwordHash: pwHash,
        role: 'teacher',
        roomCode: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `users/${uid}`);
    }
  } else {
    const data = snap.data();
    if (data.passwordHash !== pwHash) throw new Error('INVALID_PASSWORD');
    displayName = sanitizeName(data.name || cleanName);
    roomCode = String(data.roomCode || '');
    role = isTeacherCode || data.role === 'teacher' ? 'teacher' : 'player';
    if (role === 'teacher' && data.role !== 'teacher') {
      try {
        await updateDoc(ref, { role: 'teacher', updatedAt: serverTimestamp() });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
      }
    }
  }

  const sess: CloudSession = { uid, name: displayName, role, roomCode };
  currentSession = sess;
  saveSessionUid(uid);
  ready = true;
  startListeners(sess);
  setStatus('ok');
  return sess;
}

async function logout(): Promise<void> {
  clearSubscriptions();
  currentSession = null;
  saveSessionUid(null);
  setStatus('idle');
}

async function updateDisplayName(name: string): Promise<string> {
  if (!currentSession) throw new Error('NOT_SIGNED_IN');
  const clean = sanitizeName(name);
  const path = `users/${currentSession.uid}`;
  try {
    await updateDoc(doc(db, 'users', currentSession.uid), {
      name: clean,
      updatedAt: serverTimestamp(),
    });
    currentSession.name = clean;
    return clean;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

async function updateActiveRoomCode(code: string): Promise<void> {
  if (!currentSession) return;
  const clean = String(code || '').toUpperCase().slice(0, 6);
  const path = `users/${currentSession.uid}`;
  try {
    await updateDoc(doc(db, 'users', currentSession.uid), {
      roomCode: clean,
      updatedAt: serverTimestamp(),
    });
    currentSession.roomCode = clean;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

async function isRoomCodeAvailable(code: string): Promise<boolean> {
  const clean = String(code || '').toUpperCase().slice(0, 6);
  try {
    const snap = await getDoc(doc(db, 'rooms', clean));
    return !snap.exists();
  } catch {
    return false;
  }
}

async function createRoom(roomObj: any): Promise<void> {
  if (!currentSession) throw new Error('NOT_SIGNED_IN');
  const uid = currentSession.uid;
  const payload = sanitizeRoomForSave(roomObj, uid, currentSession.name);
  const path = `rooms/${payload.code}`;
  setStatus('syncing');
  try {
    await setDoc(doc(db, 'rooms', payload.code), {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await updateActiveRoomCode(payload.code);
    attachRoomDetailListeners(payload.code, uid, uid);
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

async function saveRoomMeta(code: string, roomObj: any): Promise<void> {
  if (!currentSession) return;
  const cleanCode = String(code || '').toUpperCase().slice(0, 6);
  const payload = sanitizeRoomForSave(roomObj, roomObj.ownerUid || currentSession.uid, roomObj.ownerName || currentSession.name);
  const path = `rooms/${cleanCode}`;
  setStatus('syncing');
  try {
    await updateDoc(doc(db, 'rooms', cleanCode), {
      lessonId: payload.lessonId,
      status: payload.status,
      city: payload.city,
      cityStart: payload.cityStart,
      durationMin: payload.durationMin,
      startedAt: payload.startedAt,
      endsAt: payload.endsAt,
      endedAt: payload.endedAt,
      endReason: payload.endReason,
      winner: payload.winner,
      memberUids: payload.memberUids,
      roster: payload.roster,
      log: payload.log,
      usedAudit: payload.usedAudit,
      usedHelp: payload.usedHelp,
      usedTrait: payload.usedTrait,
      updatedAt: serverTimestamp(),
    });
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

async function syncRoster(code: string, roomObj: any, removedIds: string[] = []): Promise<void> {
  if (!currentSession) return;
  const cleanCode = String(code || '').toUpperCase().slice(0, 6);
  const ownerUid = roomObj.ownerUid || currentSession.uid;
  setStatus('syncing');
  try {
    await saveRoomMeta(cleanCode, roomObj);
    for (const rid of removedIds) {
      const delPath = `rooms/${cleanCode}/players/${rid}`;
      try {
        await deleteDoc(doc(db, 'rooms', cleanCode, 'players', rid));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, delPath);
      }
    }
    for (const p of roomObj.players || []) {
      const pRef = doc(db, 'rooms', cleanCode, 'players', p.id);
      const pPath = `rooms/${cleanCode}/players/${p.id}`;
      const pData = sanitizePlayerForSave(p, cleanCode, ownerUid);
      try {
        const snap = await getDoc(pRef);
        if (!snap.exists()) {
          await setDoc(pRef, {
            ...pData,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } else {
          await updateDoc(pRef, {
            name: pData.name,
            role: pData.role,
            life: pData.life,
            coop: pData.coop,
            step: pData.step,
            pre: pData.pre,
            preScores: pData.preScores,
            traitGame: pData.traitGame,
            post: pData.post,
            claimedByUid: pData.claimedByUid,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, pPath);
      }
    }
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    throw error;
  }
}

async function savePlayer(code: string, playerObj: any, ownerUid?: string): Promise<void> {
  if (!currentSession) return;
  const cleanCode = String(code || '').toUpperCase().slice(0, 6);
  const pRef = doc(db, 'rooms', cleanCode, 'players', playerObj.id);
  const pPath = `rooms/${cleanCode}/players/${playerObj.id}`;
  const pData = sanitizePlayerForSave(playerObj, cleanCode, ownerUid || currentSession.uid);
  setStatus('syncing');
  try {
    const snap = await getDoc(pRef);
    if (!snap.exists()) {
      await setDoc(pRef, {
        ...pData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(pRef, {
        name: pData.name,
        role: pData.role,
        life: pData.life,
        coop: pData.coop,
        step: pData.step,
        pre: pData.pre,
        preScores: pData.preScores,
        traitGame: pData.traitGame,
        post: pData.post,
        claimedByUid: pData.claimedByUid,
        updatedAt: serverTimestamp(),
      });
    }
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    handleFirestoreError(error, OperationType.WRITE, pPath);
  }
}

async function fetchRoomByCode(code: string): Promise<any | null> {
  if (!currentSession) return null;
  const cleanCode = String(code || '').trim().toUpperCase().slice(0, 6);
  if (!cleanCode) return null;
  const path = `rooms/${cleanCode}`;
  let snap;
  try {
    snap = await getDoc(doc(db, 'rooms', cleanCode));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) return null;
  const data = snap.data();
  mergeRemoteRoom(data);
  ensureLessonLoaded(data.lessonId);

  const uid = currentSession.uid;
  const members: string[] = Array.isArray(data.memberUids) ? data.memberUids : [];
  if (!members.includes(uid) && members.length < 30) {
    try {
      await updateDoc(doc(db, 'rooms', cleanCode), {
        memberUids: arrayUnion(uid),
        updatedAt: serverTimestamp(),
      });
      if (hooks?.getDB().rooms[cleanCode]) {
        hooks.getDB().rooms[cleanCode].memberUids = [...members, uid];
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  }
  await updateActiveRoomCode(cleanCode);
  attachRoomDetailListeners(cleanCode, data.ownerUid, uid);
  return hooks?.getDB().rooms[cleanCode] || null;
}

async function claimAndLoadPlayer(code: string, pid: string): Promise<any | null> {
  if (!currentSession) return null;
  const cleanCode = String(code || '').toUpperCase().slice(0, 6);
  const uid = currentSession.uid;
  const pRef = doc(db, 'rooms', cleanCode, 'players', pid);
  const pPath = `rooms/${cleanCode}/players/${pid}`;
  let snap;
  try {
    snap = await getDoc(pRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, pPath);
  }
  if (!snap.exists()) return null;
  const pd = snap.data();
  if (!pd.claimedByUid) {
    try {
      await updateDoc(pRef, {
        claimedByUid: uid,
        updatedAt: serverTimestamp(),
      });
      pd.claimedByUid = uid;
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, pPath);
    }
  }

  const DB = hooks?.getDB();
  const room = DB?.rooms[cleanCode];
  if (room) {
    const idx = (room.players || []).findIndex((x: any) => x.id === pid);
    const prevEv = idx >= 0 && room.players[idx].evidence ? room.players[idx].evidence : {};
    const mapped = {
      id: pd.id,
      name: pd.name,
      role: pd.role,
      life: pd.life ?? 0,
      coop: pd.coop ?? 0,
      step: pd.step ?? 0,
      pre: pd.pre ?? null,
      preScores: pd.preScores ?? null,
      traitGame: pd.traitGame || {},
      post: pd.post ?? null,
      claimedByUid: pd.claimedByUid ?? null,
      evidence: prevEv,
    };
    if (idx >= 0) room.players[idx] = mapped;
    else room.players.push(mapped);
  }

  try {
    const eq =
      room?.ownerUid === uid
        ? query(collection(db, 'rooms', cleanCode, 'evidence'), where('ownerUid', '==', uid))
        : query(collection(db, 'rooms', cleanCode, 'evidence'), where('authorUid', '==', uid));
    const evSnap = await getDocs(eq);
    const pl = room?.players?.find((x: any) => x.id === pid);
    if (pl) {
      evSnap.forEach((d) => {
        const ed = d.data();
        if (ed.playerId === pid) {
          pl.evidence[ed.trait] = {
            img: ed.img,
            desc: ed.desc,
            ai: ed.ai,
            status: ed.status,
            at: ed.at,
          };
        }
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, `rooms/${cleanCode}/evidence`);
  }

  return room?.players?.find((x: any) => x.id === pid) || null;
}

async function submitPostTest(code: string, pid: string, postObj: any): Promise<void> {
  if (!currentSession) return;
  const cleanCode = String(code || '').toUpperCase().slice(0, 6);
  const pPath = `rooms/${cleanCode}/players/${pid}`;
  setStatus('syncing');
  try {
    await updateDoc(doc(db, 'rooms', cleanCode, 'players', pid), {
      post: postObj,
      updatedAt: serverTimestamp(),
    });
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    handleFirestoreError(error, OperationType.UPDATE, pPath);
  }
}

async function submitEvidence(
  code: string,
  roomOwnerUid: string,
  pid: string,
  trait: string,
  evObj: { img: string; desc: string; ai: string; status: string; at: number }
): Promise<void> {
  if (!currentSession) return;
  const cleanCode = String(code || '').toUpperCase().slice(0, 6);
  const evId = `${pid}_${trait}`;
  const evRef = doc(db, 'rooms', cleanCode, 'evidence', evId);
  const evPath = `rooms/${cleanCode}/evidence/${evId}`;
  setStatus('syncing');
  try {
    const snap = await getDoc(evRef);
    const img = String(evObj.img || '').slice(0, 599000);
    const desc = String(evObj.desc || '').trim().slice(0, 2000);
    if (!snap.exists()) {
      await setDoc(evRef, {
        id: evId,
        roomCode: cleanCode,
        ownerUid: roomOwnerUid,
        authorUid: currentSession.uid,
        playerId: pid,
        trait,
        img,
        desc,
        ai: evObj.ai,
        status: 'pending',
        at: evObj.at,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(evRef, {
        img,
        desc,
        ai: evObj.ai,
        status: 'pending',
        at: evObj.at,
        updatedAt: serverTimestamp(),
      });
    }
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    handleFirestoreError(error, OperationType.WRITE, evPath);
  }
}

async function reviewEvidence(code: string, pid: string, trait: string, status: 'approved' | 'rejected'): Promise<void> {
  if (!currentSession) return;
  const cleanCode = String(code || '').toUpperCase().slice(0, 6);
  const evId = `${pid}_${trait}`;
  const evPath = `rooms/${cleanCode}/evidence/${evId}`;
  setStatus('syncing');
  try {
    await updateDoc(doc(db, 'rooms', cleanCode, 'evidence', evId), {
      status,
      updatedAt: serverTimestamp(),
    });
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    handleFirestoreError(error, OperationType.UPDATE, evPath);
  }
}

async function saveLesson(lessonObj: any): Promise<void> {
  if (!currentSession) return;
  const id = String(lessonObj.id || '').slice(0, 64);
  const ref = doc(db, 'lessons', id);
  const path = `lessons/${id}`;
  setStatus('syncing');
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        id,
        ownerUid: currentSession.uid,
        name: sanitizeName(lessonObj.name, 'ชุดสื่อการสอน').slice(0, 120),
        payload: lessonObj,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(ref, {
        name: sanitizeName(lessonObj.name, 'ชุดสื่อการสอน').slice(0, 120),
        payload: lessonObj,
        updatedAt: serverTimestamp(),
      });
    }
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

async function deleteLesson(lessonId: string): Promise<void> {
  if (!currentSession) return;
  const id = String(lessonId || '').slice(0, 64);
  const path = `lessons/${id}`;
  setStatus('syncing');
  try {
    await deleteDoc(doc(db, 'lessons', id));
    setStatus('ok');
  } catch (error) {
    setStatus('denied');
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

async function grantTeacherAdmin(nameOrUid: string): Promise<void> {
  if (!currentSession) return;
  const raw = String(nameOrUid || '').trim();
  if (!raw) throw new Error('INVALID_UID');
  const targetUid = /^u_[a-f0-9]{28}$/.test(raw) ? raw : await nameToUserId(raw);
  const userRef = doc(db, 'users', targetUid);
  let snap;
  try {
    snap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `users/${targetUid}`);
  }
  if (!snap.exists()) throw new Error('USER_NOT_FOUND');
  try {
    await updateDoc(userRef, {
      role: 'teacher',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${targetUid}`);
  }
}

const thaiErr = (e: unknown): string => {
  const m = String((e as any)?.code || (e as any)?.message || e);
  if (/USER_EXISTS/.test(m)) return 'ชื่อผู้ใช้นี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบหรือใช้ชื่ออื่น';
  if (/USER_NOT_FOUND/.test(m)) return 'ไม่พบบัญชีนี้ (กด "สมัครสมาชิกใหม่" ก่อน หรือตรวจสอบชื่อ)';
  if (/INVALID_PASSWORD/.test(m)) return 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
  if (/network-request-failed|offline|Failed to fetch|unavailable/i.test(m)) return 'เชื่อมต่ออินเทอร์เน็ตหรือเซิร์ฟเวอร์ไม่ได้';
  if (/permission-denied|Missing or insufficient permissions/i.test(m)) return 'ไม่มีสิทธิ์เข้าถึงข้อมูลนี้';
  if (/Quota exceeded/i.test(m)) return 'เกินโควต้าการใช้งานรายวันของฐานข้อมูล กรุณารอรีเซ็ตวันถัดไป';
  if (/INVALID_UID/.test(m)) return 'กรุณากรอกชื่อผู้ใช้หรือ UID ให้ถูกต้อง';
  return 'เกิดข้อผิดพลาด: ' + m;
};

const SicCloud = {
  enabled: () => true,
  authReady: () => ready,
  loggedIn: () => !!currentSession,
  uid: () => currentSession?.uid || null,
  session: () => currentSession,
  status: () => cloudStatus,
  init,
  registerWithName,
  loginWithName,
  logout,
  updateDisplayName,
  updateActiveRoomCode,
  isRoomCodeAvailable,
  createRoom,
  saveRoomMeta,
  syncRoster,
  savePlayer,
  fetchRoomByCode,
  claimAndLoadPlayer,
  submitPostTest,
  submitEvidence,
  reviewEvidence,
  saveLesson,
  deleteLesson,
  grantTeacherAdmin,
  thaiErr,
};

(window as any).SicCloud = SicCloud;
export default SicCloud;
