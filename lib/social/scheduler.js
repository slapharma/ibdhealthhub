// Ava's optimal posting windows per platform (local time, expressed as UTC offsets are caller's responsibility)
// Times are in 24h format, 'HH:MM'
const OPTIMAL_SLOTS = {
  instagram: { days: [1, 3, 5], times: ['07:00', '12:00', '19:00'] },  // Mon, Wed, Fri
  tiktok:    { days: [2, 4, 6], times: ['07:00', '12:00', '19:00'] },  // Tue, Thu, Sat
  linkedin:  { days: [2, 3, 4], times: ['09:00', '12:00'] },           // Tue, Wed, Thu
  twitter:   { days: [1, 2, 3, 4, 5], times: ['08:00', '12:00', '17:00'] }, // Mon-Fri
  facebook:  { days: [1, 3, 5], times: ['09:00', '13:00'] },           // Mon, Wed, Fri
  substack:  null,                                                       // copy-only
};

/**
 * Given a list of platforms, assign the next available optimal slot for each,
 * starting from `fromDate` (defaults to now), looking up to 14 days ahead.
 * Returns a map of { platform: ISO8601 scheduledAt }.
 */
export function autoSchedule(platforms, fromDate = new Date()) {
  const result = {};
  const usedSlots = new Set(); // prevent two platforms from landing on exact same time

  for (const platform of platforms) {
    const config = OPTIMAL_SLOTS[platform];
    if (!config) {
      // No schedule for this platform (e.g. substack)
      result[platform] = null;
      continue;
    }

    const slot = findNextSlot(config, fromDate, usedSlots);
    if (slot) {
      result[platform] = slot.toISOString();
      usedSlots.add(slot.toISOString());
    } else {
      // Fallback: schedule 24h from now if no optimal slot found in 14-day window
      const fallback = new Date(fromDate.getTime() + 24 * 60 * 60 * 1000);
      result[platform] = fallback.toISOString();
      usedSlots.add(fallback.toISOString()); // prevent multiple platforms sharing the same fallback time
    }
  }

  return result;
}

function findNextSlot(config, fromDate, usedSlots) {
  const { days, times } = config;

  // Look through the next 14 days (wider window to find non-conflicting slots)
  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const candidate = new Date(fromDate);
    candidate.setUTCDate(candidate.getUTCDate() + dayOffset);
    candidate.setUTCHours(0, 0, 0, 0);

    // getUTCDay(): 0=Sun, 1=Mon, ..., 6=Sat
    const dayOfWeek = candidate.getUTCDay() === 0 ? 7 : candidate.getUTCDay(); // convert Sun=0 to 7

    if (!days.includes(dayOfWeek)) continue;

    for (const time of times) {
      const [h, m] = time.split(':').map(Number);
      const slotDate = new Date(candidate);
      slotDate.setUTCHours(h, m, 0, 0);

      // Must be in the future
      if (slotDate <= fromDate) continue;

      // Must not conflict with already-scheduled slot
      if (usedSlots.has(slotDate.toISOString())) continue;

      return slotDate;
    }
  }

  return null;
}
