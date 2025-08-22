import moment from 'moment-timezone';
import { randomInt } from 'n8n-workflow';

import type { TimetableConfig, NextSlotResult, NextRunTime, DayOfWeek } from './SchedulerInterface';

// Helper function to map day of week string to JavaScript day number (0=Sunday, 1=Monday, etc.)
function dayStringToNumber(day: DayOfWeek): number | null {
	switch (day) {
		case 'SUN': return 0;
		case 'MON': return 1;
		case 'TUE': return 2;
		case 'WED': return 3;
		case 'THU': return 4;
		case 'FRI': return 5;
		case 'SAT': return 6;
		case 'ALL': return null; // null means all days
		default: return null;
	}
}

// Helper function to check if a date matches the specified day of week
function matchesDay(date: Date, dayOfWeek?: DayOfWeek): boolean {
	if (!dayOfWeek || dayOfWeek === 'ALL') {
		return true;
	}
	const dayNumber = dayStringToNumber(dayOfWeek);
	return dayNumber !== null && date.getDay() === dayNumber;
}

export function getNextSlotHour(now: Date, config: TimetableConfig): NextSlotResult {
	const currentHour = now.getHours();
	
	// Support both new hourConfigs and legacy fixedHours
	const hourConfigs = config.hourConfigs || [];
	
	// If using legacy mode, convert to hourConfigs format
	if (!config.hourConfigs && config.fixedHours) {
		const legacyConfigs = config.fixedHours.map(hour => ({
			hour,
			minuteMode: 'random' as const,
			dayOfWeek: 'ALL' as DayOfWeek
		}));
		return getNextSlotHour(now, { hourConfigs: legacyConfigs });
	}
	
	// Find valid slots for today
	const todaySlots = hourConfigs
		.filter(hc => matchesDay(now, hc.dayOfWeek))
		.map(hc => hc.hour)
		.sort((a, b) => a - b);
	
	// Check if there's a slot later today
	for (const hour of todaySlots) {
		if (currentHour < hour) {
			return { hour, isTomorrow: false };
		}
	}
	
	// Find next available slot starting from tomorrow
	for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
		const futureDate = new Date(now);
		futureDate.setDate(futureDate.getDate() + daysAhead);
		
		const futureDaySlots = hourConfigs
			.filter(hc => matchesDay(futureDate, hc.dayOfWeek))
			.map(hc => hc.hour)
			.sort((a, b) => a - b);
		
		if (futureDaySlots.length > 0) {
			return { 
				hour: futureDaySlots[0], 
				isTomorrow: daysAhead === 1 
			};
		}
	}
	
	// Fallback: if no valid slots found in the next week, return the first available slot
	if (hourConfigs.length > 0) {
		const allHours = hourConfigs.map(hc => hc.hour).sort((a, b) => a - b);
		return { hour: allHours[0], isTomorrow: true };
	}
	
	// No slots configured
	throw new Error('No valid time slots configured');
}

export function getNextRunTime(now: Date, config: TimetableConfig): NextRunTime {
	const { hour } = getNextSlotHour(now, config);
	
	let minute = 0;
	
	// Handle per-hour minute configuration
	if (config.hourConfigs) {
		const hourConfig = config.hourConfigs.find(hc => hc.hour === hour);
		if (hourConfig) {
			if (hourConfig.minuteMode === 'specific') {
				minute = hourConfig.minute ?? 0;
			} else {
				// Random mode: generate random minute between 0-59
				minute = randomInt(0, 60);
			}
		}
	} else {
		// Legacy support
		if (config.randomizeMinutes) {
			const minMinute = config.minMinute ?? 0;
			const maxMinute = config.maxMinute ?? 59;
			minute = randomInt(minMinute, maxMinute + 1);
		}
	}

	// Calculate the actual next run date considering day-specific scheduling
	const nextRun = findNextValidDate(now, hour, config);
	nextRun.setHours(hour, minute, 0, 0);
	
	return {
		date: now,
		candidate: nextRun
	};
}

// Helper function to find the next valid date for a given hour considering day constraints
function findNextValidDate(now: Date, targetHour: number, config: TimetableConfig): Date {
	const hourConfigs = config.hourConfigs || [];
	
	// If using legacy mode, any day is valid
	if (!config.hourConfigs && config.fixedHours) {
		const nextRun = new Date(now);
		if (now.getHours() >= targetHour) {
			nextRun.setDate(nextRun.getDate() + 1);
		}
		return nextRun;
	}
	
	// Find the hour config that matches our target hour
	const relevantConfigs = hourConfigs.filter(hc => hc.hour === targetHour);
	
	// Check if today works
	for (const config of relevantConfigs) {
		if (matchesDay(now, config.dayOfWeek) && now.getHours() < targetHour) {
			return new Date(now);
		}
	}
	
	// Find next valid day
	for (let daysAhead = 1; daysAhead <= 7; daysAhead++) {
		const futureDate = new Date(now);
		futureDate.setDate(futureDate.getDate() + daysAhead);
		
		for (const config of relevantConfigs) {
			if (matchesDay(futureDate, config.dayOfWeek)) {
				return futureDate;
			}
		}
	}
	
	// Fallback to tomorrow if no specific day match found
	const fallback = new Date(now);
	fallback.setDate(fallback.getDate() + 1);
	return fallback;
}

export function shouldTriggerAtTime(
	currentTime: Date,
	lastTriggerTime: number | undefined,
	config: TimetableConfig
): boolean {
	const currentHour = currentTime.getHours();
	const currentTimeUtc = new Date(currentTime.getTime());
	
	console.log(`[shouldTriggerAtTime] Checking trigger conditions:`);
	console.log(`[shouldTriggerAtTime] Current time: ${currentTimeUtc.toISOString()} (Hour: ${currentHour}, Day: ${currentTime.toLocaleDateString('en-US', {weekday: 'short'})})`);
	
	// Check if current hour and day match any configured slots
	const matchingConfigs = config.hourConfigs ? 
		config.hourConfigs.filter(hc => 
			hc.hour === currentHour && matchesDay(currentTime, hc.dayOfWeek)
		) : [];
	
	const hasValidSlot = config.hourConfigs ? 
		matchingConfigs.length > 0 : 
		(config.fixedHours || []).includes(currentHour);
	
	console.log(`[shouldTriggerAtTime] Matching hour configs:`, matchingConfigs.map(hc => ({
		hour: hc.hour,
		dayOfWeek: hc.dayOfWeek,
		minuteMode: hc.minuteMode,
		minute: hc.minute
	})));
	
	// Calculate and show the exact trigger time for each matching config
	if (matchingConfigs.length > 0) {
		console.log(`[shouldTriggerAtTime] Calculated trigger times for current hour ${currentHour}:`);
		matchingConfigs.forEach((hc, index) => {
			let calculatedMinute: number;
			if (hc.minuteMode === 'specific') {
				calculatedMinute = hc.minute ?? 0;
				console.log(`[shouldTriggerAtTime]   Config ${index + 1}: ${currentHour.toString().padStart(2, '0')}:${calculatedMinute.toString().padStart(2, '0')} (specific minute)`);
			} else {
				calculatedMinute = randomInt(0, 60);
				console.log(`[shouldTriggerAtTime]   Config ${index + 1}: ${currentHour.toString().padStart(2, '0')}:${calculatedMinute.toString().padStart(2, '0')} (random minute 0-59)`);
			}
			
			// Show the full UTC timestamp for this calculated time
			const calculatedTime = new Date(currentTime);
			calculatedTime.setHours(currentHour, calculatedMinute, 0, 0);
			console.log(`[shouldTriggerAtTime]   Config ${index + 1} exact time: ${calculatedTime.toISOString()}`);
		});
	}
	
	console.log(`[shouldTriggerAtTime] Has valid slot: ${hasValidSlot}`);
		
	if (!hasValidSlot) {
		console.log(`[shouldTriggerAtTime] ✗ No valid time slot for current hour ${currentHour}`);
		return false;
	}

	// If no previous trigger, allow this one
	if (!lastTriggerTime) {
		console.log(`[shouldTriggerAtTime] ✓ No previous trigger, allowing execution`);
		return true;
	}

	const lastTrigger = new Date(lastTriggerTime);
	const timeSinceLastTrigger = currentTime.getTime() - lastTrigger.getTime();
	const timeSinceLastTriggerMinutes = Math.floor(timeSinceLastTrigger / (60 * 1000));
	
	console.log(`[shouldTriggerAtTime] Last trigger: ${lastTrigger.toISOString()} (${timeSinceLastTriggerMinutes} minutes ago)`);
	console.log(`[shouldTriggerAtTime] Last trigger hour: ${lastTrigger.getHours()}, Current hour: ${currentHour}`);
	
	// Prevent multiple triggers within the same hour
	const oneHourMs = 60 * 60 * 1000;
	if (timeSinceLastTrigger < oneHourMs && lastTrigger.getHours() === currentHour) {
		console.log(`[shouldTriggerAtTime] ✗ Already triggered this hour (${timeSinceLastTriggerMinutes} minutes ago)`);
		return false;
	}

	console.log(`[shouldTriggerAtTime] ✓ Conditions met, trigger allowed`);
	return true;
}

export function shouldTriggerNow(
	lastTriggerTime: number | undefined,
	config: TimetableConfig,
	timezone: string
): boolean {
	const now = moment.tz(timezone).toDate();
	return shouldTriggerAtTime(now, lastTriggerTime, config);
}

// Centralized logging service for consistent debug output
export class TimetableLogger {
	private static formatTime(time: Date): string {
		return moment.utc(time).format('YYYY-MM-DD HH:mm:ss');
	}

	static logConfiguration(timezone: string, configs: any[], nextRun?: Date) {
		console.log(`[TimetableTrigger] Configuration loaded at ${new Date().toISOString()}:`);
		console.log(`[TimetableTrigger] Timezone: ${timezone}`);
		console.log(`[TimetableTrigger] Hour configs:`, configs);
		
		if (nextRun) {
			console.log(`[TimetableTrigger] Next scheduled trigger: ${nextRun.toISOString()} (${this.formatTime(nextRun)} UTC)`);
		}
	}

	static logCronRegistration() {
		console.log(`[TimetableTrigger] Registering cron job to run every minute for condition checking`);
	}

	static logTriggerCheck(currentTime: Date, timezone: string, lastTriggerTime: number | undefined, shouldTrigger: boolean) {
		const currentTimeUtc = moment.utc(currentTime);
		console.log(`[TimetableTrigger] Trigger check at ${currentTimeUtc.format('YYYY-MM-DD HH:mm:ss')} UTC (${currentTime.toISOString()})`);
		console.log(`[TimetableTrigger] Current time in timezone ${timezone}: ${moment.tz(timezone).format('YYYY-MM-DD HH:mm:ss')}`);
		console.log(`[TimetableTrigger] Last trigger time: ${lastTriggerTime ? new Date(lastTriggerTime).toISOString() : 'never'}`);
		console.log(`[TimetableTrigger] Should trigger: ${shouldTrigger}`);
	}

	static logSkipTrigger(nextRun: Date) {
		console.log(`[TimetableTrigger] Not triggering. Next scheduled: ${this.formatTime(nextRun)} UTC`);
	}

	static logExecution(type: 'manual' | 'automatic', time: Date, timezone?: string) {
		const symbol = type === 'manual' ? '✓ MANUAL EXECUTION' : '✓ TRIGGERING WORKFLOW';
		console.log(`[TimetableTrigger] ${symbol} at ${this.formatTime(time)} UTC`);
		
		if (type === 'manual' && timezone) {
			console.log(`[TimetableTrigger] Manual execution in timezone ${timezone}: ${moment.tz(timezone).format('YYYY-MM-DD HH:mm:ss')}`);
		}
	}

	static logNextScheduled(nextRun: Date) {
		console.log(`[TimetableTrigger] Next scheduled after manual execution: ${this.formatTime(nextRun)} UTC`);
	}

	static logError(context: string, error: Error | string) {
		console.log(`[TimetableTrigger] Error ${context}: ${error instanceof Error ? error.message : error}`);
	}
}

export function createResultData(
	momentTz: moment.Moment,
	timezone: string,
	hourConfigs: Array<{ hour: number; minute: string; dayOfWeek?: string }>,
	nextRun: NextRunTime,
	isManual: boolean
) {
	return {
		timestamp: momentTz.toISOString(true),
		'Readable date': momentTz.format('MMMM Do YYYY, h:mm:ss a'),
		'Readable time': momentTz.format('h:mm:ss a'),
		'Day of week': momentTz.format('dddd'),
		Year: momentTz.format('YYYY'),
		Month: momentTz.format('MMMM'),
		'Day of month': momentTz.format('DD'),
		Hour: momentTz.format('HH'),
		Minute: momentTz.format('mm'),
		Second: momentTz.format('ss'),
		Timezone: `${timezone} (UTC${momentTz.format('Z')})`,
		'Trigger hours': hourConfigs.map(hc => ({
			hour: hc.hour,
			minute: hc.minute,
			dayOfWeek: hc.dayOfWeek
		})),
		'Next scheduled': nextRun.candidate.toISOString(),
		'Next scheduled readable': moment.tz(nextRun.candidate, timezone).format('MMMM Do YYYY, h:mm:ss a'),
		'Manual execution': isManual
	};
}

