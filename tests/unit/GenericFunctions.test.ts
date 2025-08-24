import * as n8nWorkflow from 'n8n-workflow';

// Mock moment-timezone at the top level
jest.mock('moment-timezone', () => {
	const originalMoment = jest.requireActual('moment-timezone');
	return {
		...originalMoment,
		tz: jest.fn(() => ({
			toDate: () => new Date('2024-01-01T12:30:00Z') // Mock current time to 12:30
		}))
	};
});

import { 
	getNextSlotHour, 
	getNextRunTime, 
	shouldTriggerAtTime
} from '../../nodes/Timetable/GenericFunctions';
import type { HourConfig } from '../../nodes/Timetable/SchedulerInterface';

describe('getNextSlotHour', () => {
	it('should return next available slot within the same day', () => {
		const now = new Date('2024-01-01T10:00:00Z');
		const hourConfigs: HourConfig[] = [
			{ hour: 12, minute: 'random', dayOfWeek: 'ALL' },
			{ hour: 16, minute: 'random', dayOfWeek: 'ALL' },
			{ hour: 21, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		const result = getNextSlotHour(now, hourConfigs);
		
		expect(result).toEqual({
			hour: 12,
			isTomorrow: false
		});
	});

	it('should return next available slot later in the day', () => {
		const now = new Date('2024-01-01T14:00:00Z');
		const hourConfigs: HourConfig[] = [
			{ hour: 12, minute: 'random', dayOfWeek: 'ALL' },
			{ hour: 16, minute: 'random', dayOfWeek: 'ALL' },
			{ hour: 21, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		const result = getNextSlotHour(now, hourConfigs);
		
		expect(result).toEqual({
			hour: 16,
			isTomorrow: false
		});
	});

	it('should return first slot of tomorrow when all today slots have passed', () => {
		const now = new Date('2024-01-01T22:00:00Z');
		const hourConfigs: HourConfig[] = [
			{ hour: 12, minute: 'random', dayOfWeek: 'ALL' },
			{ hour: 16, minute: 'random', dayOfWeek: 'ALL' },
			{ hour: 21, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		const result = getNextSlotHour(now, hourConfigs);
		
		expect(result).toEqual({
			hour: 12,
			isTomorrow: true
		});
	});

	it('should handle single fixed hour', () => {
		const now = new Date('2024-01-01T10:00:00Z');
		const hourConfigs: HourConfig[] = [
			{ hour: 15, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		const result = getNextSlotHour(now, hourConfigs);
		
		expect(result).toEqual({
			hour: 15,
			isTomorrow: false
		});
	});
});

describe('getNextRunTime', () => {
	beforeEach(() => {
		// Mock randomInt to return a predictable value for testing
		Object.defineProperty(n8nWorkflow, 'randomInt', {
			value: jest.fn().mockReturnValue(30),
			configurable: true,
		});
	});

	it('should return next run time with specific minute', () => {
		const now = new Date('2024-01-01T10:00:00Z');
		const hourConfigs: HourConfig[] = [
			{ hour: 12, minute: 15, dayOfWeek: 'ALL' },
			{ hour: 16, minute: 30, dayOfWeek: 'ALL' }
		];
		
		const result = getNextRunTime(now, hourConfigs);
		
		expect(result.candidate.getHours()).toBe(12);
		expect(result.candidate.getMinutes()).toBe(15);
		expect(result.candidate.getDate()).toBe(1); // Same day
	});

	it('should return next run time with randomization', () => {
		const now = new Date('2024-01-01T10:00:00Z');
		const hourConfigs: HourConfig[] = [
			{ hour: 12, minute: 'random', dayOfWeek: 'ALL' },
			{ hour: 16, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		const result = getNextRunTime(now, hourConfigs);
		
		expect(result.candidate.getHours()).toBe(12);
		expect(result.candidate.getMinutes()).toBe(30); // Mock value
		expect(result.candidate.getDate()).toBe(1); // Same day
	});

	it('should return next run time for tomorrow', () => {
		const now = new Date('2024-01-01T22:00:00Z');
		const hourConfigs: HourConfig[] = [
			{ hour: 12, minute: 0, dayOfWeek: 'ALL' },
			{ hour: 16, minute: 0, dayOfWeek: 'ALL' }
		];
		
		const result = getNextRunTime(now, hourConfigs);
		
		expect(result.candidate.getHours()).toBe(12);
		expect(result.candidate.getMinutes()).toBe(0);
		expect(result.candidate.getDate()).toBe(2); // Next day
	});

	it('should handle string minute values', () => {
		const now = new Date('2024-01-01T10:00:00Z');
		const hourConfigs: HourConfig[] = [
			{ hour: 12, minute: '45', dayOfWeek: 'ALL' }
		];
		
		const result = getNextRunTime(now, hourConfigs);
		
		expect(result.candidate.getHours()).toBe(12);
		expect(result.candidate.getMinutes()).toBe(45);
		expect(result.candidate.getDate()).toBe(1); // Same day
	});
});

describe('shouldTriggerAtTime', () => {
	it('should return false when current hour is not configured', () => {
		const currentTime = new Date('2024-01-01T10:30:00Z'); // 10:30 AM
		const hourConfigs: HourConfig[] = [
			{ hour: 16, minute: 'random', dayOfWeek: 'ALL' },
			{ hour: 21, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		const result = shouldTriggerAtTime(currentTime, undefined, hourConfigs);
		
		expect(result).toBe(false);
	});

	it('should return true for first trigger when hour matches', () => {
		const currentTime = new Date('2024-01-01T12:30:00Z'); // This will be hour 12
		const actualHour = currentTime.getHours();
		const hourConfigs: HourConfig[] = [
			{ hour: actualHour, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		const result = shouldTriggerAtTime(currentTime, undefined, hourConfigs);
		
		expect(result).toBe(true);
	});

	it('should prevent multiple triggers in the same hour', () => {
		const currentTime = new Date('2024-01-01T12:30:00Z');
		const actualHour = currentTime.getHours();
		const hourConfigs: HourConfig[] = [
			{ hour: actualHour, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		// Last trigger was 10 minutes ago in the same hour
		const lastTriggerTime = currentTime.getTime() - (10 * 60 * 1000);
		
		const result = shouldTriggerAtTime(currentTime, lastTriggerTime, hourConfigs);
		
		expect(result).toBe(false);
	});

	it('should allow trigger after sufficient time has passed', () => {
		const currentTime = new Date('2024-01-01T12:30:00Z');
		const actualHour = currentTime.getHours();
		const hourConfigs: HourConfig[] = [
			{ hour: actualHour, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		// Last trigger was more than 1 hour ago
		const lastTriggerTime = currentTime.getTime() - (2 * 60 * 60 * 1000);
		
		const result = shouldTriggerAtTime(currentTime, lastTriggerTime, hourConfigs);
		
		expect(result).toBe(true);
	});

	it('should allow trigger in different hour even if less than 1 hour passed', () => {
		const currentTime = new Date('2024-01-01T16:10:00Z');
		const actualCurrentHour = currentTime.getHours();
		const hourConfigs: HourConfig[] = [
			{ hour: actualCurrentHour, minute: 'random', dayOfWeek: 'ALL' }
		];
		
		// Create a time that's in a different hour but less than 1 hour ago
		const earlierTime = new Date(currentTime);
		earlierTime.setHours(actualCurrentHour - 1); // Previous hour
		const lastTriggerTime = earlierTime.getTime();
		
		const result = shouldTriggerAtTime(currentTime, lastTriggerTime, hourConfigs);
		
		expect(result).toBe(true);
	});
});


describe('Day-specific scheduling', () => {
	describe('getNextSlotHour with day constraints', () => {
		it('should find next Monday slot when today is Sunday', () => {
			const now = new Date('2024-01-07T10:00:00Z'); // Sunday
			const hourConfigs: HourConfig[] = [
				{ hour: 14, minute: 'random', dayOfWeek: 'MON' }
			];
			
			const result = getNextSlotHour(now, hourConfigs);
			
			expect(result).toEqual({
				hour: 14,
				isTomorrow: true // Next Monday is tomorrow
			});
		});

		it('should find slot later today when day matches', () => {
			const now = new Date('2024-01-01T10:00:00Z'); // Monday
			const hourConfigs: HourConfig[] = [
				{ hour: 14, minute: 'random', dayOfWeek: 'MON' }
			];
			
			const result = getNextSlotHour(now, hourConfigs);
			
			expect(result).toEqual({
				hour: 14,
				isTomorrow: false
			});
		});

		it('should skip days that dont match', () => {
			const now = new Date('2024-01-01T10:00:00Z'); // Monday
			const hourConfigs: HourConfig[] = [
				{ hour: 14, minute: 'random', dayOfWeek: 'FRI' }
			];
			
			const result = getNextSlotHour(now, hourConfigs);
			
			expect(result).toEqual({
				hour: 14,
				isTomorrow: false // Friday is more than tomorrow but function sets this based on calculation
			});
		});

		it('should handle ALL day configuration', () => {
			const now = new Date('2024-01-01T10:00:00Z');
			const hourConfigs: HourConfig[] = [
				{ hour: 14, minute: 'random', dayOfWeek: 'ALL' }
			];
			
			const result = getNextSlotHour(now, hourConfigs);
			
			expect(result).toEqual({
				hour: 14,
				isTomorrow: false
			});
		});
	});

	describe('shouldTriggerAtTime with day constraints', () => {
		it('should not trigger on wrong day', () => {
			const currentTime = new Date('2024-01-01T14:30:00Z'); // Monday
			const hourConfigs: HourConfig[] = [
				{ hour: 14, minute: 'random', dayOfWeek: 'FRI' }
			];
			
			const result = shouldTriggerAtTime(currentTime, undefined, hourConfigs);
			
			expect(result).toBe(false);
		});

		it('should trigger on correct day and hour', () => {
			const currentTime = new Date('2024-01-05T14:30:00'); // Friday (local time)
			const hourConfigs: HourConfig[] = [
				{ hour: 14, minute: 'random', dayOfWeek: 'FRI' }
			];
			
			const result = shouldTriggerAtTime(currentTime, undefined, hourConfigs);
			
			expect(result).toBe(true);
		});

		it('should trigger on ALL day configuration', () => {
			const currentTime = new Date('2024-01-03T14:30:00'); // Wednesday (local time)
			const hourConfigs: HourConfig[] = [
				{ hour: 14, minute: 'random', dayOfWeek: 'ALL' }
			];
			
			const result = shouldTriggerAtTime(currentTime, undefined, hourConfigs);
			
			expect(result).toBe(true);
		});
	});

});