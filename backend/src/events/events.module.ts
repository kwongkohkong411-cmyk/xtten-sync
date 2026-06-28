import { Global, Module } from '@nestjs/common';
import { EventConsistencyCheckerService } from './event-consistency-checker.service';
import { EventDlqController } from './event-dlq.controller';
import { EventDlqLifecycleService } from './event-dlq-lifecycle.service';
import { EventDeadLetterService } from './event-dead-letter.service';
import { EventControlPlaneService } from './event-control-plane.service';
import { EventInfrastructureService } from './event-infrastructure.service';
import { EventLogService } from './event-log.service';
import { EventOpsService } from './event-ops.service';
import { EventGovernancePolicyService } from './event-governance-policy.service';
import { Employee360ProjectionService } from './employee-360-projection.service';
import { EventQueueConsumer } from './event-queue.consumer';
import { EventsController } from './events.controller';

@Global()
@Module({
  controllers: [EventsController, EventDlqController],
  providers: [
    EventInfrastructureService,
    EventDeadLetterService,
    EventControlPlaneService,
    EventDlqLifecycleService,
    EventLogService,
    EventOpsService,
    EventGovernancePolicyService,
    Employee360ProjectionService,
    EventQueueConsumer,
    EventConsistencyCheckerService,
  ],
  exports: [
    EventInfrastructureService,
    EventDeadLetterService,
    EventControlPlaneService,
    EventDlqLifecycleService,
    EventLogService,
    EventOpsService,
    EventGovernancePolicyService,
    Employee360ProjectionService,
  ],
})
export class EventsModule {}
