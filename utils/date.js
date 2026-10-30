'use strict';

/**
 * Date helpers.
 *
 * Storage rule: timestamps are stored as UTC Date objects. Calendar days are
 * stored as `dateKey` strings ("YYYY-MM-DD") resolved in the app timezone
 * (Asia/Kolkata, a fixed +05:30 offset with no DST). Keeping the day key as a
 * string avoids every "which day is this?" bug that timezone math invites.
 */

const TIMEZONE = 'Asia/Kolkata';
const TZ_OFFSET = '+05:30';
const TZ_OFFSET_MINUTES = 330;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTES_PER_DAY = 1440;
const HOURS_PER_DAY = 24;

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidDateKey(key) {
  if (typeof key !== 'string' || !DATE_KEY_RE.test(key)) return false;
  const date = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === key;
}

function isValidTimeString(value) {
  return typeof value === 'string' && TIME_RE.test(value);
}

/** Current calendar day in Asia/Kolkata. */
function currentDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** UTC instant of 00:00 Asia/Kolkata for a date key. */
function startOfDay(dateKey) {
  return new Date(`${dateKey}T00:00:00${TZ_OFFSET}`);
}

/** UTC instant of 24:00 Asia/Kolkata (exclusive end of day). */
function endOfDay(dateKey) {
  return new Date(startOfDay(dateKey).getTime() + DAY_MS);
}

function addDays(dateKey, days) {
  const base = new Date(`${dateKey}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Whole days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
function isFutureDateKey(key, todayKey = currentDateKey()) {
  return isValidDateKey(key) && diffDays(todayKey, key) > 0;
}

function diffDays(fromKey, toKey) {
  const a = new Date(`${fromKey}T00:00:00Z`).getTime();
  const b = new Date(`${toKey}T00:00:00Z`).getTime();
  return Math.round((b - a) / DAY_MS);
}

function weekdayName(dateKey) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function weekdayShort(dateKey) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function formatDateLong(dateKey) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

function formatDateShort(dateKey) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dateKey}T12:00:00Z`));
}

/** Hour-of-day (0-23) of an instant, in Asia/Kolkata. */
function hourInTimezone(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour').value;
  return Number(hour) % 24;
}

function minutesOfDayInTimezone(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return hour * 60 + minute;
}

function formatTimeInTimezone(date, { seconds = false } = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TIMEZONE,
    hour: 'numeric',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: true,
  }).format(date);
}

/** "HH:MM" -> minutes since midnight. */
function parseTimeToMinutes(value) {
  if (!isValidTimeString(value)) return null;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTimeString(minutes) {
  const safe = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = String(Math.floor(safe / 60)).padStart(2, '0');
  const m = String(safe % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** Inclusive list of date keys from -> to (max 400 entries). */
function dateKeyRange(fromKey, toKey) {
  const span = diffDays(fromKey, toKey);
  if (span < 0) return [];
  const keys = [];
  for (let i = 0; i <= Math.min(span, 399); i += 1) keys.push(addDays(fromKey, i));
  return keys;
}

/** Build a UTC instant for a local (Asia/Kolkata) date key + "HH:MM". */
function instantFromLocal(dateKey, time) {
  return new Date(`${dateKey}T${time}:00${TZ_OFFSET}`);
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, hour) => {
  const label = (h) => {
    const suffix = h < 12 ? 'AM' : 'PM';
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display} ${suffix}`;
  };
  return `${String(hour).padStart(2, '0')}:00 – ${label(hour + 1)}`;
});

function hourRangeLabel(hour) {
  const fmt = (h) => {
    const normalized = ((h % 24) + 24) % 24;
    const suffix = normalized < 12 ? 'AM' : 'PM';
    const display = normalized % 12 === 0 ? 12 : normalized % 12;
    return `${display} ${suffix}`;
  };
  return `${fmt(hour)} – ${fmt(hour + 1)}`;
}

module.exports = {
  TIMEZONE,
  TZ_OFFSET,
  TZ_OFFSET_MINUTES,
  DAY_MS,
  MINUTES_PER_DAY,
  HOURS_PER_DAY,
  HOUR_LABELS,
  hourRangeLabel,
  isValidDateKey,
  isFutureDateKey,
  isValidTimeString,
  currentDateKey,
  startOfDay,
  endOfDay,
  addDays,
  diffDays,
  weekdayName,
  weekdayShort,
  formatDateLong,
  formatDateShort,
  hourInTimezone,
  minutesOfDayInTimezone,
  formatTimeInTimezone,
  parseTimeToMinutes,
  minutesToTimeString,
  dateKeyRange,
  instantFromLocal,
};
