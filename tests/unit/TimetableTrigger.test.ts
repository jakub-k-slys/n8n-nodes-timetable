import type { ITriggerFunctions } from 'n8n-workflow';
import { TimetableTrigger } from '../../nodes/Timetable/TimetableTrigger.node';

describe('TimetableTrigger', () => {
	let timetableTrigger: TimetableTrigger;
	let mockContext: Partial<ITriggerFunctions>;

	beforeEach(() => {
		timetableTrigger = new TimetableTrigger();
		
		// Create comprehensive mock context
		mockContext = {
			getMode: jest.fn(),
			getTimezone: jest.fn().mockReturnValue('UTC'),
			emit: jest.fn(),
			getNodeParameter: jest.fn(),
			getWorkflowStaticData: jest.fn().mockReturnValue({}),
			getNode: jest.fn().mockReturnValue({ name: 'Test Node' }),
			helpers: {
				returnJsonArray: jest.fn().mockImplementation((data) => data),
				registerCron: jest.fn()
			} as any,
			logger: {
				info: jest.fn(),
				error: jest.fn(),
				debug: jest.fn(),
				warn: jest.fn()
			}
		};
	});

	describe('trigger method - manual mode', () => {
		beforeEach(() => {
			(mockContext.getMode as jest.Mock).mockReturnValue('manual');
		});

		it('should call manual processing path when mode is manual', async () => {
			const result = await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);

			expect(mockContext.getMode).toHaveBeenCalledTimes(1);
			expect(mockContext.getTimezone).toHaveBeenCalledTimes(1);
			expect(mockContext.logger!.info).toHaveBeenCalledWith(expect.stringContaining('✓ MANUAL EXECUTION'));
			expect(mockContext.logger!.info).toHaveBeenCalledWith(expect.stringContaining('Manual execution in timezone UTC'));
			expect(result.manualTriggerFunction).toBeDefined();
		});

		it('should emit correct data when manual trigger function is executed', async () => {
			const result = await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);
			
			// Execute the manual trigger function
			await result.manualTriggerFunction!();

			expect(mockContext.emit).toHaveBeenCalledTimes(1);
			const emittedData = (mockContext.emit as jest.Mock).mock.calls[0][0][0][0]; // Additional [0] to unwrap from array
			
			expect(emittedData).toHaveProperty('timestamp');
			expect(emittedData).toHaveProperty('Readable date');
			expect(emittedData).toHaveProperty('Readable time');
			expect(emittedData).toHaveProperty('Manual execution', true);
			expect(emittedData).toHaveProperty('year');
			expect(emittedData).toHaveProperty('month');
			expect(emittedData).toHaveProperty('day');
			expect(emittedData).toHaveProperty('hour');
			expect(emittedData).toHaveProperty('minute');
			expect(emittedData).toHaveProperty('second');
			expect(emittedData).toHaveProperty('dayOfWeek');
			expect(emittedData).toHaveProperty('weekday');
			expect(emittedData).toHaveProperty('timezone', 'UTC');
		});

		it('should not call getNodeParameter in manual mode', async () => {
			await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);
			
			expect(mockContext.getNodeParameter).not.toHaveBeenCalled();
		});

		it('should not call registerCron in manual mode', async () => {
			await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);
			
			expect(mockContext.helpers!.registerCron).not.toHaveBeenCalled();
		});
	});

	describe('trigger method - normal mode', () => {
		beforeEach(() => {
			(mockContext.getMode as jest.Mock).mockReturnValue('trigger');
			(mockContext.getNodeParameter as jest.Mock).mockReturnValue({
				hours: [
					{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }
				]
			});
		});

		it('should call normal processing path when mode is not manual', async () => {
			const result = await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);

			expect(mockContext.getMode).toHaveBeenCalledTimes(1);
			expect(mockContext.getNodeParameter).toHaveBeenCalledWith('triggerSlots', {
				hours: [
					{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }
				]
			});
			expect(mockContext.getTimezone).toHaveBeenCalledTimes(1);
			expect(mockContext.getWorkflowStaticData).toHaveBeenCalledWith('node');
			expect(result).toEqual({});
		});

		it('should register cron job in normal mode', async () => {
			await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);

			expect(mockContext.helpers!.registerCron).toHaveBeenCalledWith(
				'* * * * * *',
				expect.any(Function)
			);
			expect(mockContext.logger!.info).toHaveBeenCalledWith('Registering cron job to run every minute for condition checking');
		});

		it('should log configuration details in normal mode', async () => {
			await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);

			expect(mockContext.logger!.info).toHaveBeenCalledWith(expect.stringContaining('Configuration loaded at'));
			expect(mockContext.logger!.info).toHaveBeenCalledWith('Timezone: UTC');
			expect(mockContext.logger!.info).toHaveBeenCalledWith(expect.stringContaining('Hour configs:'));
			expect(mockContext.logger!.info).toHaveBeenCalledWith(expect.stringContaining('Next scheduled trigger:'));
		});

		it('should not return manualTriggerFunction in normal mode', async () => {
			const result = await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);

			expect(result.manualTriggerFunction).toBeUndefined();
		});

		it('should handle configuration errors gracefully', async () => {
			(mockContext.getNodeParameter as jest.Mock).mockReturnValue({
				hours: [] // Empty hours should cause validation error
			});

			await expect(
				timetableTrigger.trigger.call(mockContext as ITriggerFunctions)
			).rejects.toThrow('At least one valid hour must be selected');
		});

		it('should handle multiple hour configurations', async () => {
			(mockContext.getNodeParameter as jest.Mock).mockReturnValue({
				hours: [
					{ hour: 9, minute: 30, dayOfWeek: 'MON' },
					{ hour: 14, minute: 'random', dayOfWeek: 'FRI' },
					{ hour: 18, minute: 0, dayOfWeek: 'ALL' }
				]
			});

			const result = await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);

			expect(mockContext.helpers!.registerCron).toHaveBeenCalled();
			expect(result).toEqual({});
		});
	});

	describe('trigger method - different timezones', () => {
		it('should handle different timezone in manual mode', async () => {
			(mockContext.getMode as jest.Mock).mockReturnValue('manual');
			(mockContext.getTimezone as jest.Mock).mockReturnValue('America/New_York');

			const result = await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);
			await result.manualTriggerFunction!();

			const emittedData = (mockContext.emit as jest.Mock).mock.calls[0][0][0][0]; // Additional [0] to unwrap from array
			expect(emittedData).toHaveProperty('timezone', 'America/New_York');
			expect(mockContext.logger!.info).toHaveBeenCalledWith(expect.stringContaining('Manual execution in timezone America/New_York'));
		});

		it('should handle different timezone in normal mode', async () => {
			(mockContext.getMode as jest.Mock).mockReturnValue('trigger');
			(mockContext.getTimezone as jest.Mock).mockReturnValue('Europe/London');
			(mockContext.getNodeParameter as jest.Mock).mockReturnValue({
				hours: [
					{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }
				]
			});

			await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);

			expect(mockContext.logger!.info).toHaveBeenCalledWith('Timezone: Europe/London');
		});

		it('should handle getWorkflowStaticData returning undefined', async () => {
			(mockContext.getMode as jest.Mock).mockReturnValue('trigger');
			(mockContext.getWorkflowStaticData as jest.Mock).mockReturnValue(undefined);
			(mockContext.getNodeParameter as jest.Mock).mockReturnValue({
				hours: [
					{ hour: 12, minute: 'random', dayOfWeek: 'ALL' }
				]
			});

			const result = await timetableTrigger.trigger.call(mockContext as ITriggerFunctions);

			expect(mockContext.getWorkflowStaticData).toHaveBeenCalledTimes(1);
			expect(mockContext.helpers!.registerCron).toHaveBeenCalledTimes(1);
			expect(result).toEqual({});
		});
	});
});