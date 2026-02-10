import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin, AuthRequest } from '../middleware/auth.js';
import {
  getTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  sendMessage,
  getMessageHistory,
  getMessageRecipients,
  retryFailedRecipients,
  substituteVariables,
  checkDailyBudget,
} from '../services/messageService.js';
import { query } from '../db/index.js';
import { Player, Pool, SendMessageRequest, CreateTemplateRequest } from '../types/index.js';

const router = Router();

// All routes require admin auth
router.use(authenticateAdmin);

// ================== Validation Schemas ==================

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  category: z.enum(['invite', 'reminder', 'notification', 'custom']),
  trigger_type: z.enum(['manual', 'automatic']).optional(),
  sms_template: z.string().optional(),
  email_subject: z.string().max(200).optional(),
  email_template: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

const updateTemplateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  category: z.enum(['invite', 'reminder', 'notification', 'custom']).optional(),
  sms_template: z.string().optional(),
  email_subject: z.string().max(200).optional(),
  email_template: z.string().optional(),
  variables: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
});

const sendMessageSchema = z.object({
  template_id: z.string().uuid().optional(),
  sms_content: z.string().optional(),
  email_subject: z.string().max(200).optional(),
  email_content: z.string().optional(),
  channel: z.enum(['sms', 'email', 'both']),
  recipient_type: z.enum(['all', 'pool', 'group', 'custom']),
  pool_id: z.string().uuid().optional(),
  group_id: z.string().uuid().optional(),
  player_ids: z.array(z.string().uuid()).optional(),
  filters: z.object({
    payment_status: z.enum(['paid', 'unpaid', 'partial']).optional(),
    has_squares: z.boolean().optional(),
    has_phone: z.boolean().optional(),
    has_email: z.boolean().optional(),
  }).optional(),
});

const previewMessageSchema = z.object({
  template_id: z.string().uuid().optional(),
  sms_content: z.string().optional(),
  email_subject: z.string().optional(),
  email_content: z.string().optional(),
  player_id: z.string().uuid().optional(),
  pool_id: z.string().uuid().optional(),
});

// ================== Template Routes ==================

// GET /api/messages/templates - List all templates
router.get('/templates', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const templates = await getTemplates(admin.id);
    res.json(templates);
  } catch (error) {
    console.error('List templates error:', error);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

// POST /api/messages/templates - Create custom template
router.post('/templates', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const parsed = createTemplateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message })),
      });
    }

    const template = await createTemplate(admin.id, parsed.data as CreateTemplateRequest);
    res.status(201).json(template);
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

// GET /api/messages/templates/:id - Get template details
router.get('/templates/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const template = await getTemplate(req.params.id, admin.id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Failed to get template' });
  }
});

// PATCH /api/messages/templates/:id - Update custom template
router.patch('/templates/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const parsed = updateTemplateSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message })),
      });
    }

    const template = await updateTemplate(req.params.id, admin.id, parsed.data);

    if (!template) {
      return res.status(404).json({ error: 'Template not found or is a system template' });
    }

    res.json(template);
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// DELETE /api/messages/templates/:id - Delete custom template
router.delete('/templates/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const deleted = await deleteTemplate(req.params.id, admin.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Template not found or is a system template' });
    }

    res.json({ message: 'Template deleted' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ================== Message Preview ==================

// POST /api/messages/preview - Preview message with variable substitution
router.post('/preview', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const parsed = previewMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message })),
      });
    }

    const { template_id, sms_content, email_subject, email_content, player_id, pool_id } = parsed.data;

    // Get template content if template_id provided
    let smsTemplate = sms_content || '';
    let emailSubjectTemplate = email_subject || '';
    let emailContentTemplate = email_content || '';

    if (template_id) {
      const template = await getTemplate(template_id, admin.id);
      if (template) {
        smsTemplate = sms_content || template.sms_template || '';
        emailSubjectTemplate = email_subject || template.email_subject || '';
        emailContentTemplate = email_content || template.email_template || '';
      }
    }

    // Build context
    const context: Parameters<typeof substituteVariables>[1] = {
      admin: { name: admin.name, email: admin.email },
    };

    // Get sample player
    if (player_id) {
      const playerResult = await query<Player>('SELECT * FROM players WHERE id = $1', [player_id]);
      if (playerResult.rows[0]) {
        context.player = playerResult.rows[0];
      }
    } else {
      // Use first player as sample
      const playerResult = await query<Player>('SELECT * FROM players LIMIT 1');
      if (playerResult.rows[0]) {
        context.player = playerResult.rows[0];
      }
    }

    // Get pool if provided
    if (pool_id) {
      const poolResult = await query<Pool>('SELECT * FROM pools WHERE id = $1', [pool_id]);
      if (poolResult.rows[0]) {
        context.pool = poolResult.rows[0];

        // Get player's squares if both player and pool
        if (context.player) {
          const squaresResult = await query<{ row: number; col: number }>(
            'SELECT row_idx as row, col_idx as col FROM squares WHERE pool_id = $1 AND player_id = $2',
            [pool_id, context.player.id]
          );
          context.squares = squaresResult.rows;
          context.amount_owed = squaresResult.rows.length * context.pool.denomination;
        }
      }
    }

    // Substitute variables
    const previewSms = substituteVariables(smsTemplate, context);
    const previewEmailSubject = substituteVariables(emailSubjectTemplate, context);
    const previewEmailContent = substituteVariables(emailContentTemplate, context);

    res.json({
      sms: previewSms,
      sms_character_count: previewSms.length,
      sms_segments: Math.ceil(previewSms.length / 160),
      email_subject: previewEmailSubject,
      email_content: previewEmailContent,
      sample_player: context.player ? { id: context.player.id, name: context.player.name } : null,
    });
  } catch (error) {
    console.error('Preview message error:', error);
    res.status(500).json({ error: 'Failed to preview message' });
  }
});

// ================== Send Message ==================

// GET /api/messages/budget - Check daily budget
router.get('/budget', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const budget = await checkDailyBudget(admin.id);
    res.json(budget);
  } catch (error) {
    console.error('Check budget error:', error);
    res.status(500).json({ error: 'Failed to check budget' });
  }
});

// POST /api/messages/send - Send message to recipients
router.post('/send', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const parsed = sendMessageSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: parsed.error.errors.map(e => ({ field: e.path[0], message: e.message })),
      });
    }

    // Validate that we have content
    const { template_id, sms_content, email_content, channel } = parsed.data;
    if (!template_id && !sms_content && !email_content) {
      return res.status(400).json({ error: 'Must provide template_id or message content' });
    }

    // Check if we need SMS content
    if ((channel === 'sms' || channel === 'both') && !template_id && !sms_content) {
      return res.status(400).json({ error: 'SMS content required when sending via SMS' });
    }

    // Check if we need email content
    if ((channel === 'email' || channel === 'both') && !template_id && !email_content) {
      return res.status(400).json({ error: 'Email content required when sending via email' });
    }

    // Check daily budget for SMS
    if (channel === 'sms' || channel === 'both') {
      const budget = await checkDailyBudget(admin.id);
      if (!budget.canSend) {
        return res.status(429).json({
          error: 'Daily SMS limit reached',
          used: budget.used,
          limit: budget.limit,
        });
      }
    }

    const result = await sendMessage(admin.id, parsed.data as SendMessageRequest, admin.name);

    if (result.success) {
      res.json({
        message: 'Messages sent successfully',
        ...result,
      });
    } else {
      res.status(207).json({
        message: 'Some messages failed to send',
        ...result,
      });
    }
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send messages' });
  }
});

// ================== Message History ==================

// GET /api/messages/history - List sent messages
router.get('/history', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const pool_id = req.query.pool_id as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const history = await getMessageHistory(admin.id, { pool_id, limit, offset });
    res.json(history);
  } catch (error) {
    console.error('Get message history error:', error);
    res.status(500).json({ error: 'Failed to get message history' });
  }
});

// GET /api/messages/history/:id - Get send details with recipients
router.get('/history/:id', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const sendId = req.params.id;

    // Get send record
    const sendResult = await query(
      `SELECT ms.*,
         mt.name as template_name,
         CASE WHEN p.id IS NOT NULL THEN p.away_team || ' vs ' || p.home_team ELSE NULL END as pool_name,
         pg.name as group_name
       FROM message_sends ms
       LEFT JOIN message_templates mt ON ms.template_id = mt.id
       LEFT JOIN pools p ON ms.pool_id = p.id
       LEFT JOIN player_groups pg ON ms.group_id = pg.id
       WHERE ms.id = $1 AND ms.admin_id = $2`,
      [sendId, admin.id]
    );

    if (sendResult.rows.length === 0) {
      return res.status(404).json({ error: 'Message send not found' });
    }

    // Get recipients
    const recipients = await getMessageRecipients(sendId, admin.id);

    res.json({
      ...sendResult.rows[0],
      recipients,
    });
  } catch (error) {
    console.error('Get send details error:', error);
    res.status(500).json({ error: 'Failed to get send details' });
  }
});

// POST /api/messages/history/:id/retry - Retry failed recipients
router.post('/history/:id/retry', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const sendId = req.params.id;

    const result = await retryFailedRecipients(sendId, admin.id);

    if (result.retried === 0) {
      return res.status(404).json({ error: 'No failed recipients to retry' });
    }

    res.json({
      message: `Retried ${result.retried} recipients`,
      ...result,
    });
  } catch (error) {
    console.error('Retry failed recipients error:', error);
    res.status(500).json({ error: 'Failed to retry messages' });
  }
});

// ================== Quick Pool Actions ==================

// POST /api/messages/pool/:poolId/invite - Quick invite to pool
router.post('/pool/:poolId/invite', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const poolId = req.params.poolId;
    const { player_ids, group_id } = req.body;

    // Get the invite template
    const templates = await getTemplates(admin.id);
    const inviteTemplate = templates.find(t => t.name === 'Pool Invite' && t.is_system);

    if (!inviteTemplate) {
      return res.status(500).json({ error: 'Invite template not found' });
    }

    const result = await sendMessage(
      admin.id,
      {
        template_id: inviteTemplate.id,
        channel: 'sms',
        recipient_type: player_ids ? 'custom' : group_id ? 'group' : 'all',
        pool_id: poolId,
        group_id,
        player_ids,
      },
      admin.name
    );

    res.json(result);
  } catch (error) {
    console.error('Quick invite error:', error);
    res.status(500).json({ error: 'Failed to send invites' });
  }
});

// POST /api/messages/pool/:poolId/reminder - Payment reminder
router.post('/pool/:poolId/reminder', async (req: AuthRequest, res: Response) => {
  try {
    const admin = req.admin!;
    const poolId = req.params.poolId;

    // Get the reminder template
    const templates = await getTemplates(admin.id);
    const reminderTemplate = templates.find(t => t.name === 'Payment Reminder' && t.is_system);

    if (!reminderTemplate) {
      return res.status(500).json({ error: 'Reminder template not found' });
    }

    const result = await sendMessage(
      admin.id,
      {
        template_id: reminderTemplate.id,
        channel: 'sms',
        recipient_type: 'pool',
        pool_id: poolId,
        filters: { payment_status: 'unpaid' },
      },
      admin.name
    );

    res.json(result);
  } catch (error) {
    console.error('Quick reminder error:', error);
    res.status(500).json({ error: 'Failed to send reminders' });
  }
});

export default router;
