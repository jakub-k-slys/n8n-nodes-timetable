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
				const minMinute = hourConfig.minMinute ?? 0;
				const maxMinute = hourConfig.maxMinute ?? 59;
				minute = randomInt(minMinute, maxMinute + 1);
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
	
	// Check if current hour and day match any configured slots
	const hasValidSlot = config.hourConfigs ? 
		config.hourConfigs.some(hc => 
			hc.hour === currentHour && matchesDay(currentTime, hc.dayOfWeek)
		) : 
		(config.fixedHours || []).includes(currentHour);
		
	if (!hasValidSlot) {
		return false;
	}

	// If no previous trigger, allow this one
	if (!lastTriggerTime) {
		return true;
	}

	const lastTrigger = new Date(lastTriggerTime);
	const timeSinceLastTrigger = currentTime.getTime() - lastTrigger.getTime();
	
	// Prevent multiple triggers within the same hour
	const oneHourMs = 60 * 60 * 1000;
	if (timeSinceLastTrigger < oneHourMs && lastTrigger.getHours() === currentHour) {
		return false;
	}

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

export function toCronExpression(config: TimetableConfig) {
	// Create a cron expression that triggers every minute during configured hours and days
	// We'll use shouldTriggerNow() to filter out unwanted triggers
	
	if (config.hourConfigs && config.hourConfigs.length > 0) {
		// Group configs by day to create more efficient cron expressions
		const dayGroups = new Map<string, number[]>();
		
		for (const hc of config.hourConfigs) {
			const dayKey = hc.dayOfWeek || 'ALL';
			if (!dayGroups.has(dayKey)) {
				dayGroups.set(dayKey, []);
			}
			dayGroups.get(dayKey)!.push(hc.hour);
		}
		
		// If all slots are for 'ALL' days, use simple expression
		if (dayGroups.size === 1 && dayGroups.has('ALL')) {
			const hours = Array.from(new Set(dayGroups.get('ALL')!)).sort().join(',');
			return `0 * ${hours} * * *` as any;
		}
		
		// For day-specific schedules, we'll use a more general cron expression
		// and rely on shouldTriggerNow() to do the filtering
		const allHours = Array.from(new Set(
			config.hourConfigs.map(hc => hc.hour)
		)).sort().join(',');
		
		// Note: We use a general expression and filter in shouldTriggerNow()
		// because cron day-of-week syntax can get complex with mixed days
		return `0 * ${allHours} * * *` as any;
	} else {
		// Legacy support
		const configuredHours = config.fixedHours || [];
		const hoursExpression = configuredHours.join(',');
		return `0 * ${hoursExpression} * * *` as any;
	}
}
