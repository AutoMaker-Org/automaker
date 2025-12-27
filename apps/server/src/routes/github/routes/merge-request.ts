import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { mergeGatekeeperService } from '../../../services/merge-gatekeeper.js';

const router = Router();

/**
 * POST /github/merge-request/start
 *
 * Start monitoring a PR for merge eligibility
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      prNumber: z.number().int().positive(),
      repository: z.string().min(1),
      requestedBy: z.string().min(1),
    });

    const { prNumber, repository, requestedBy } = schema.parse(req.body);

    await mergeGatekeeperService.startMonitoring(prNumber, repository, requestedBy);

    res.json({
      success: true,
      message: `Started monitoring PR #${prNumber}`,
      data: {
        prNumber,
        repository,
      },
    });
  } catch (error) {
    console.error('[MergeRequest] Error starting monitoring:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start monitoring',
    });
  }
});

/**
 * POST /github/merge-request/stop
 *
 * Stop monitoring a PR
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      prNumber: z.number().int().positive(),
    });

    const { prNumber } = schema.parse(req.body);

    mergeGatekeeperService.stopMonitoring(prNumber);

    res.json({
      success: true,
      message: `Stopped monitoring PR #${prNumber}`,
      data: { prNumber },
    });
  } catch (error) {
    console.error('[MergeRequest] Error stopping monitoring:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to stop monitoring',
    });
  }
});

/**
 * POST /github/merge-request/check
 *
 * Check if a PR is eligible for merge
 */
router.post('/check', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      prNumber: z.number().int().positive(),
      repository: z.string().min(1),
    });

    const { prNumber, repository } = schema.parse(req.body);

    const eligibility = await mergeGatekeeperService.checkMergeEligibility(
      prNumber,
      repository
    );

    res.json({
      success: true,
      data: eligibility,
    });
  } catch (error) {
    console.error('[MergeRequest] Error checking eligibility:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check eligibility',
    });
  }
});

/**
 * POST /github/merge-request/approve
 *
 * Approve and merge a PR that is ready for merge
 * ⚠️ CRITICAL: Only merges to 0xtsotsi/DevFlow, never to upstream automaker
 */
router.post('/approve', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      prNumber: z.number().int().positive(),
      repository: z.string().min(1),
      approvedBy: z.string().min(1),
    });

    const { prNumber, repository, approvedBy } = schema.parse(req.body);

    await mergeGatekeeperService.approveMerge(prNumber, repository, approvedBy);

    res.json({
      success: true,
      message: `Successfully merged PR #${prNumber}`,
      data: {
        prNumber,
        repository,
      },
    });
  } catch (error) {
    console.error('[MergeRequest] Error approving merge:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to approve merge',
    });
  }
});

/**
 * POST /github/merge-request/reject
 *
 * Reject a merge request
 */
router.post('/reject', async (req: Request, res: Response) => {
  try {
    const schema = z.object({
      prNumber: z.number().int().positive(),
      reason: z.string().optional(),
    });

    const { prNumber, reason = 'No reason provided' } = schema.parse(req.body);

    mergeGatekeeperService.rejectMerge(prNumber, reason);

    res.json({
      success: true,
      message: `Rejected merge request for PR #${prNumber}`,
      data: { prNumber },
    });
  } catch (error) {
    console.error('[MergeRequest] Error rejecting merge:', error);

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reject merge',
    });
  }
});

/**
 * GET /github/merge-request/list
 *
 * Get all merge requests
 */
router.get('/list', (req: Request, res: Response) => {
  try {
    const mergeRequests = mergeGatekeeperService.getMergeRequests();

    res.json({
      success: true,
      data: mergeRequests,
    });
  } catch (error) {
    console.error('[MergeRequest] Error listing merge requests:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list merge requests',
    });
  }
});

/**
 * GET /github/merge-request/:prNumber
 *
 * Get details of a specific merge request
 */
router.get('/:prNumber', (req: Request, res: Response) => {
  try {
    const prNumber = parseInt(req.params.prNumber, 10);

    if (isNaN(prNumber)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid PR number',
      });
    }

    const mergeRequest = mergeGatekeeperService.getMergeRequest(prNumber);

    if (!mergeRequest) {
      return res.status(404).json({
        success: false,
        error: `No merge request found for PR #${prNumber}`,
      });
    }

    res.json({
      success: true,
      data: mergeRequest,
    });
  } catch (error) {
    console.error('[MergeRequest] Error getting merge request:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get merge request',
    });
  }
});

export default router;
