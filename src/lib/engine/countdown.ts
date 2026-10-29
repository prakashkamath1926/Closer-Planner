/**
 * Event Countdown Calculator.
 *
 * Rules:
 * - Deterministic math.
 * - Accurate across timezone boundaries and date changes.
 * - Calculates days, hours, minutes, seconds, and past/today flags.
 */

export interface EventCountdownState {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSecondsRemaining: number;
  isPast: boolean;
  isToday: boolean;
}

/**
 * Calculates countdown units from now to the event date.
 */
export function calculateEventCountdown(
  eventAtInput: string | Date | null | undefined,
  nowInput: string | Date = new Date(),
): EventCountdownState {
  if (!eventAtInput) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSecondsRemaining: 0,
      isPast: false,
      isToday: false,
    };
  }

  const eventTime = typeof eventAtInput === "string" ? new Date(eventAtInput).getTime() : eventAtInput.getTime();
  const nowTime = typeof nowInput === "string" ? new Date(nowInput).getTime() : nowInput.getTime();

  if (Number.isNaN(eventTime) || Number.isNaN(nowTime)) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSecondsRemaining: 0,
      isPast: false,
      isToday: false,
    };
  }

  const diffMs = eventTime - nowTime;

  if (diffMs <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      totalSecondsRemaining: 0,
      isPast: true,
      isToday: true,
    };
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const totalHours = Math.floor(totalMinutes / 60);
  const hours = totalHours % 24;
  const days = Math.floor(totalHours / 24);

  const isToday = days === 0 && totalSeconds > 0;

  return {
    days,
    hours,
    minutes,
    seconds,
    totalSecondsRemaining: totalSeconds,
    isPast: false,
    isToday,
  };
}

