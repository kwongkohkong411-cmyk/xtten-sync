import { Body, Controller, Get, Patch, Post, Query } from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator';
import { EventControlPlaneService } from './event-control-plane.service';
import { EventOpsService } from './event-ops.service';
import { Employee360ProjectionService } from './employee-360-projection.service';

@Controller('events')
export class EventsController {
  constructor(
    private readonly eventOpsService: EventOpsService,
    private readonly controlPlaneService: EventControlPlaneService,
    private readonly projectionService: Employee360ProjectionService,
  ) {}

  @RequirePermission('system:admin')
  @Get('metrics')
  getMetrics(@Query('companyId') companyId?: string) {
    return this.eventOpsService.getMetrics(companyId);
  }

  @RequirePermission('system:admin')
  @Get('health')
  getHealth(@Query('companyId') companyId?: string) {
    return this.eventOpsService.getHealth(companyId);
  }

  @RequirePermission('system:admin')
  @Get('control-plane')
  async getControlPlaneDashboard(
    @Query('companyId') companyId?: string,
    @Query('limit') limit?: string,
  ) {
    const safeLimit = Math.min(100, Math.max(5, Number(limit || 20)));

    const [
      metrics,
      health,
      decision,
      decisionTimeline,
      repairLocks,
      deadLetters,
    ] = await Promise.all([
      this.eventOpsService.getMetrics(companyId),
      this.eventOpsService.getHealth(companyId),
      this.controlPlaneService.getDecision(),
      this.controlPlaneService.listDecisionTimeline(safeLimit),
      this.controlPlaneService.listRepairLocks(safeLimit),
      this.controlPlaneService.listDeadLetters?.(companyId, safeLimit),
    ]);

    return {
      metrics,
      health,
      decision,
      decisionTimeline,
      repairLocks,
      deadLetters: deadLetters || [],
    };
  }

  @RequirePermission('system:admin')
  @Get('control-plane/freeze')
  getFreezeState() {
    return this.controlPlaneService.getManualFreezeState();
  }

  @RequirePermission('system:admin')
  @Get('control-plane/decision')
  getGovernanceDecision(@Query('forceRefresh') forceRefresh?: string) {
    return this.controlPlaneService.getDecision(forceRefresh === 'true');
  }

  @RequirePermission('system:admin')
  @Get('control-plane/constraints')
  getGovernanceConstraints(@Query('companyId') companyId?: string) {
    return this.controlPlaneService.getSafetyConstraints(companyId);
  }

  @RequirePermission('system:admin')
  @Patch('control-plane/freeze')
  setFreezeState(@Body() body: { enabled: boolean; reason?: string }) {
    return this.controlPlaneService.setManualFreeze(
      Boolean(body?.enabled),
      body?.reason,
    );
  }

  @RequirePermission('system:admin')
  @Get('control-plane/dry-run')
  getDryRunState() {
    return this.controlPlaneService.getDryRunState();
  }

  @RequirePermission('system:admin')
  @Patch('control-plane/dry-run')
  setDryRunState(@Body() body: { enabled: boolean; reason?: string }) {
    return this.controlPlaneService.setDryRun(
      Boolean(body?.enabled),
      body?.reason,
    );
  }

  @RequirePermission('system:admin')
  @Get('control-plane/policy')
  getPolicy(@Query('companyId') companyId?: string) {
    return this.controlPlaneService.getPolicy(companyId);
  }

  @RequirePermission('system:admin')
  @Patch('control-plane/policy/global')
  setGlobalPolicy(@Body() body: { patch: Record<string, unknown> }) {
    return this.controlPlaneService.setGlobalPolicyOverride(body?.patch || {});
  }

  @RequirePermission('system:admin')
  @Patch('control-plane/policy/company')
  setCompanyPolicy(
    @Body() body: { companyId: string; patch: Record<string, unknown> },
  ) {
    return this.controlPlaneService.setCompanyPolicyOverride(
      String(body?.companyId || ''),
      body?.patch || {},
    );
  }

  @RequirePermission('system:admin')
  @Post('control-plane/policy/company/clear')
  clearCompanyPolicy(@Body() body: { companyId: string }) {
    return this.controlPlaneService.clearCompanyPolicyOverride(
      String(body?.companyId || ''),
    );
  }

  @RequirePermission('system:admin')
  @Post('control-plane/simulate')
  simulateDecision(
    @Body()
    body: {
      companyId?: string;
      metrics?: Record<string, unknown>;
      policyOverride?: Record<string, unknown>;
      previousDecision?: Record<string, unknown>;
    },
  ) {
    return this.controlPlaneService.simulateDecision({
      companyId: body?.companyId,
      metrics: body?.metrics,
      policyOverride: body?.policyOverride,
      previousDecision: body?.previousDecision,
    });
  }

  @RequirePermission('system:admin')
  @Post('control-plane/replay')
  replayDecisionTimeline(
    @Body()
    body: {
      companyId?: string;
      limit?: number;
      policyOverride?: Record<string, unknown>;
    },
  ) {
    return this.controlPlaneService.replayDecisions({
      companyId: body?.companyId,
      limit: body?.limit,
      policyOverride: body?.policyOverride,
    });
  }

  @RequirePermission('system:admin')
  @Post('perf/projection-read')
  benchmarkProjectionRead(
    @Body() body: { companyId?: string; limit?: number; batchSize?: number },
  ) {
    return this.projectionService.benchmarkProjectionReads(body || {});
  }
}
