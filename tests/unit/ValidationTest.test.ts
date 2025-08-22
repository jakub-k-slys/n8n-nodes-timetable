import { RawTriggerHoursDataCodec } from '../../nodes/Timetable/SchedulerInterface';
import { isRight } from 'fp-ts/lib/Either';
import { PathReporter } from 'io-ts/lib/PathReporter';

describe('io-ts Configuration Validation', () => {
	describe('Valid configurations', () => {
		it('should validate correct configuration with random minute', () => {
			const validConfig = {
				hours: [
					{ hour: 12, minute: 'random', dayOfWeek: 'ALL' },
					{ hour: 16, minute: 'random', dayOfWeek: 'MON' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(validConfig);
			expect(isRight(result)).toBe(true);
		});

		it('should validate correct configuration with specific minute', () => {
			const validConfig = {
				hours: [
					{ hour: 14, minute: '30', dayOfWeek: 'FRI' },
					{ hour: 9, minute: '0', dayOfWeek: 'ALL' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(validConfig);
			expect(isRight(result)).toBe(true);
		});

		it('should validate configuration with undefined dayOfWeek', () => {
			const validConfig = {
				hours: [
					{ hour: 12, minute: 'random' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(validConfig);
			expect(isRight(result)).toBe(true);
		});
	});

	describe('Invalid configurations', () => {
		it('should reject invalid hour (out of range)', () => {
			const invalidConfig = {
				hours: [
					{ hour: 25, minute: 'random', dayOfWeek: 'ALL' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
			
			if (!isRight(result)) {
				const errors = PathReporter.report(result);
				expect(errors[0]).toContain('ValidHour');
			}
		});

		it('should reject invalid hour (negative)', () => {
			const invalidConfig = {
				hours: [
					{ hour: -1, minute: 'random', dayOfWeek: 'ALL' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
		});

		it('should reject invalid hour (non-integer)', () => {
			const invalidConfig = {
				hours: [
					{ hour: 12.5, minute: 'random', dayOfWeek: 'ALL' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
		});

		it('should reject invalid minute (out of range)', () => {
			const invalidConfig = {
				hours: [
					{ hour: 12, minute: '60', dayOfWeek: 'ALL' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
			
			if (!isRight(result)) {
				const errors = PathReporter.report(result);
				expect(errors[0]).toContain('ValidMinute');
			}
		});

		it('should reject invalid minute (not a valid string)', () => {
			const invalidConfig = {
				hours: [
					{ hour: 12, minute: 'invalid', dayOfWeek: 'ALL' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
		});

		it('should reject invalid dayOfWeek', () => {
			const invalidConfig = {
				hours: [
					{ hour: 12, minute: 'random', dayOfWeek: 'INVALID' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
			
			if (!isRight(result)) {
				const errors = PathReporter.report(result);
				expect(errors[0]).toContain('Invalid value "INVALID"');
			}
		});

		it('should reject missing required fields', () => {
			const invalidConfig = {
				hours: [
					{ minute: 'random', dayOfWeek: 'ALL' } // missing hour
				]
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
		});

		it('should reject non-array hours', () => {
			const invalidConfig = {
				hours: 'not an array'
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
		});

		it('should reject missing hours field', () => {
			const invalidConfig = {};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
		});
	});

	describe('Error reporting', () => {
		it('should provide helpful error messages', () => {
			const invalidConfig = {
				hours: [
					{ hour: 25, minute: '60', dayOfWeek: 'INVALID' }
				]
			};

			const result = RawTriggerHoursDataCodec.decode(invalidConfig);
			expect(isRight(result)).toBe(false);
			
			if (!isRight(result)) {
				const errors = PathReporter.report(result);
				expect(errors.length).toBeGreaterThan(0);
				
				// Should mention specific validation failures
				const errorString = errors.join(' ');
				expect(errorString).toMatch(/ValidHour|ValidMinute|union/);
			}
		});
	});
});