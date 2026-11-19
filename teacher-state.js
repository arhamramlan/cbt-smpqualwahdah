// teacher-state.js — data bersama modul guru (live binding: modul lain selalu melihat nilai terbaru)
import { db, collection, doc } from './firebase-config.js';

const { listen } = window.CBT;

export let me = null, subjects = [], classes = [], packages = [], schedules = [];

const subs = {};
export const on = (evt, fn) => (subs[evt] ??= []).push(fn);
const emit = (evt) => (subs[evt] || []).forEach((fn) => { try { fn(); } catch (e) { console.error(evt, e); } });

export const assignedSubjects = () => (me?.teacherAssignments || []).map((a) => a.subject);
export const myPackages = () => packages.filter((p) => !p.createdBy || p.createdBy === me.uid || p.createdBy === 'guru' || assignedSubjects().includes(p.subject));
export const schedOf = (id) => schedules.find((s) => s.id === id);

let started = null;
export function startTeacher(user) {
  if (started === user.uid) return;
  started = user.uid; me = user;
  listen('tMe', doc(db, 'users', user.uid), (s) => { if (s.exists()) { me = { ...me, ...s.data(), uid: user.uid }; emit('me'); } });
  listen('tSubjects', collection(db, 'subjects'), (s) => { subjects = s.docs.map((d) => d.data()).sort((a, b) => a.code.localeCompare(b.code)); emit('subjects'); });
  listen('tClasses', collection(db, 'classes'), (s) => { classes = s.docs.map((d) => d.data()).sort((a, b) => a.code.localeCompare(b.code)); emit('classes'); });
  listen('tPackages', collection(db, 'packages'), (s) => { packages = s.docs.map((d) => ({ id: d.id, ...d.data() })); emit('packages'); });
  listen('tSchedules', collection(db, 'schedules'), (s) => {
    schedules = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.createdBy || x.createdBy === user.uid).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    emit('schedules');
  });
}
