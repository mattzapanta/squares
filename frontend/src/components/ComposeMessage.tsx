import { useState, useEffect } from 'react';
import {
  messages,
  MessageTemplate,
  SendMessageRequest,
  MessagePreview,
  DailyBudget,
  PlayerGroup,
  groups,
  allPlayers,
  PlayerWithStats,
} from '../api/client';

interface ComposeMessageProps {
  onClose: () => void;
  onSent?: () => void;
  // Pre-selected context
  poolId?: string;
  poolName?: string;
  groupId?: string;
  playerIds?: string[];
}

export default function ComposeMessage({
  onClose,
  onSent,
  poolId,
  poolName,
  groupId,
  playerIds: initialPlayerIds,
}: ComposeMessageProps) {
  // State
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [playerGroups, setPlayerGroups] = useState<PlayerGroup[]>([]);
  const [allPlayersList, setAllPlayersList] = useState<PlayerWithStats[]>([]);
  const [budget, setBudget] = useState<DailyBudget | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [channel, setChannel] = useState<'sms' | 'email' | 'both'>('sms');
  const [recipientType, setRecipientType] = useState<'all' | 'pool' | 'group' | 'custom'>(
    poolId ? 'pool' : groupId ? 'group' : initialPlayerIds?.length ? 'custom' : 'all'
  );
  const [selectedPoolId, setSelectedPoolId] = useState(poolId || '');
  const [selectedGroupId, setSelectedGroupId] = useState(groupId || '');
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>(initialPlayerIds || []);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');

  // Custom content (when not using template)
  const [customSms, setCustomSms] = useState('');
  const [customEmailSubject, setCustomEmailSubject] = useState('');
  const [customEmailContent, setCustomEmailContent] = useState('');

  // Preview
  const [preview, setPreview] = useState<MessagePreview | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Load initial data
  useEffect(() => {
    Promise.all([
      messages.getTemplates(),
      groups.list(),
      allPlayers.list(),
      messages.getBudget(),
    ])
      .then(([t, g, p, b]) => {
        setTemplates(t);
        setPlayerGroups(g);
        setAllPlayersList(p);
        setBudget(b);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Get selected template (used for displaying template info if needed)
  const _selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  void _selectedTemplate; // Silence unused variable warning - may be used later for template info display

  // Update preview when content changes
  useEffect(() => {
    if (!showPreview) return;

    const previewData: Parameters<typeof messages.preview>[0] = {
      template_id: selectedTemplateId || undefined,
      sms_content: customSms || undefined,
      email_subject: customEmailSubject || undefined,
      email_content: customEmailContent || undefined,
      pool_id: selectedPoolId || undefined,
    };

    messages
      .preview(previewData)
      .then(setPreview)
      .catch(() => {});
  }, [showPreview, selectedTemplateId, customSms, customEmailSubject, customEmailContent, selectedPoolId]);

  // Handle send
  const handleSend = async () => {
    setError(null);
    setSending(true);

    try {
      const request: SendMessageRequest = {
        channel,
        recipient_type: recipientType,
      };

      if (selectedTemplateId) {
        request.template_id = selectedTemplateId;
      } else {
        if (channel === 'sms' || channel === 'both') {
          request.sms_content = customSms;
        }
        if (channel === 'email' || channel === 'both') {
          request.email_subject = customEmailSubject;
          request.email_content = customEmailContent;
        }
      }

      if (recipientType === 'pool') {
        request.pool_id = selectedPoolId;
      } else if (recipientType === 'group') {
        request.group_id = selectedGroupId;
      } else if (recipientType === 'custom') {
        request.player_ids = selectedPlayerIds;
      }

      if (paymentFilter !== 'all') {
        request.filters = { payment_status: paymentFilter };
      }

      const result = await messages.send(request);

      if (result.success) {
        setSuccess(`Sent ${result.sent_count} message(s) successfully!`);
        setTimeout(() => {
          onSent?.();
          onClose();
        }, 1500);
      } else {
        setSuccess(`Sent ${result.sent_count}, failed ${result.failed_count}`);
        if (result.errors?.length) {
          setError(result.errors.slice(0, 3).join('\n'));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  // Get recipient count estimate
  const getRecipientCount = () => {
    if (recipientType === 'custom') return selectedPlayerIds.length;
    if (recipientType === 'group') {
      const group = playerGroups.find((g) => g.id === selectedGroupId);
      return group?.member_count || 0;
    }
    if (recipientType === 'all') return allPlayersList.length;
    // Pool - we don't have exact count without API call
    return '?';
  };

  // Modal styles
  const modalOverlay: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 16,
  };

  const modalContent: React.CSSProperties = {
    background: 'var(--surface)',
    borderRadius: 16,
    maxWidth: 600,
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    border: '1px solid var(--border)',
  };

  const sectionStyle: React.CSSProperties = {
    padding: '16px 20px',
    borderBottom: '1px solid var(--border)',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    display: 'block',
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 14,
    minHeight: 44,
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text)',
    fontSize: 14,
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: 100,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '12px 24px',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 700,
    cursor: 'pointer',
    minHeight: 44,
    border: 'none',
  };

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 12px',
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 36,
    border: active ? '1px solid var(--green)' : '1px solid var(--border)',
    background: active ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
    color: active ? 'var(--green)' : 'var(--muted)',
  });

  if (loading) {
    return (
      <div style={modalOverlay} onClick={onClose}>
        <div style={{ ...modalContent, padding: 40, textAlign: 'center' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div style={modalOverlay} onClick={onClose}>
      <div style={modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div
          style={{
            ...sectionStyle,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Send Message</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--muted)',
              fontSize: 24,
              cursor: 'pointer',
              minWidth: 44,
              minHeight: 44,
            }}
          >
            ×
          </button>
        </div>

        {/* Error/Success */}
        {error && (
          <div
            style={{
              ...sectionStyle,
              background: 'rgba(239, 68, 68, 0.1)',
              borderColor: 'rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
        {success && (
          <div
            style={{
              ...sectionStyle,
              background: 'rgba(74, 222, 128, 0.1)',
              borderColor: 'rgba(74, 222, 128, 0.3)',
              color: 'var(--green)',
              fontSize: 13,
            }}
          >
            {success}
          </div>
        )}

        {/* Recipients */}
        <div style={sectionStyle}>
          <label style={labelStyle}>To</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button
              style={chipStyle(recipientType === 'all')}
              onClick={() => setRecipientType('all')}
            >
              Everyone ({allPlayersList.length})
            </button>
            <button
              style={chipStyle(recipientType === 'pool')}
              onClick={() => setRecipientType('pool')}
            >
              Pool Players
            </button>
            <button
              style={chipStyle(recipientType === 'group')}
              onClick={() => setRecipientType('group')}
            >
              Group
            </button>
            <button
              style={chipStyle(recipientType === 'custom')}
              onClick={() => setRecipientType('custom')}
            >
              Select Players
            </button>
          </div>

          {recipientType === 'pool' && (
            <div style={{ marginTop: 12 }}>
              {poolId ? (
                <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 8, fontSize: 14 }}>
                  {poolName || 'Selected Pool'}
                </div>
              ) : (
                <input
                  type="text"
                  placeholder="Enter pool ID"
                  value={selectedPoolId}
                  onChange={(e) => setSelectedPoolId(e.target.value)}
                  style={selectStyle}
                />
              )}
            </div>
          )}

          {recipientType === 'group' && (
            <select
              value={selectedGroupId}
              onChange={(e) => setSelectedGroupId(e.target.value)}
              style={{ ...selectStyle, marginTop: 12 }}
            >
              <option value="">Select a group</option>
              {playerGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.member_count} members)
                </option>
              ))}
            </select>
          )}

          {recipientType === 'custom' && (
            <div style={{ marginTop: 12, maxHeight: 200, overflow: 'auto' }}>
              {allPlayersList.map((player) => (
                <label
                  key={player.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 0',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlayerIds.includes(player.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedPlayerIds([...selectedPlayerIds, player.id]);
                      } else {
                        setSelectedPlayerIds(selectedPlayerIds.filter((id) => id !== player.id));
                      }
                    }}
                    style={{ width: 18, height: 18 }}
                  />
                  <span style={{ flex: 1, fontSize: 14 }}>{player.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {player.phone || player.email || 'No contact'}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* Payment filter */}
          {recipientType === 'pool' && (
            <div style={{ marginTop: 12 }}>
              <label style={{ ...labelStyle, marginTop: 12 }}>Filter by payment</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {(['all', 'unpaid', 'paid', 'partial'] as const).map((status) => (
                  <button
                    key={status}
                    style={chipStyle(paymentFilter === status)}
                    onClick={() => setPaymentFilter(status)}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--muted)' }}>
            {getRecipientCount()} recipient(s)
          </div>
        </div>

        {/* Template */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Template</label>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            style={selectStyle}
          >
            <option value="">Custom message</option>
            {templates
              .filter((t) => t.is_system)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            {templates.filter((t) => !t.is_system).length > 0 && (
              <>
                <optgroup label="My Templates">
                  {templates
                    .filter((t) => !t.is_system)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                </optgroup>
              </>
            )}
          </select>
        </div>

        {/* Message content (if no template) */}
        {!selectedTemplateId && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Message</label>
            {(channel === 'sms' || channel === 'both') && (
              <div style={{ marginBottom: 12 }}>
                <textarea
                  placeholder="SMS message... Use {player_first_name}, {teams}, {pool_link}, etc."
                  value={customSms}
                  onChange={(e) => setCustomSms(e.target.value)}
                  style={textareaStyle}
                />
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  {customSms.length}/160 ({Math.ceil(customSms.length / 160) || 1} segment
                  {Math.ceil(customSms.length / 160) > 1 ? 's' : ''})
                </div>
              </div>
            )}
            {(channel === 'email' || channel === 'both') && (
              <>
                <input
                  type="text"
                  placeholder="Email subject"
                  value={customEmailSubject}
                  onChange={(e) => setCustomEmailSubject(e.target.value)}
                  style={{ ...selectStyle, marginBottom: 8 }}
                />
                <textarea
                  placeholder="Email content (HTML supported)"
                  value={customEmailContent}
                  onChange={(e) => setCustomEmailContent(e.target.value)}
                  style={{ ...textareaStyle, minHeight: 150 }}
                />
              </>
            )}
          </div>
        )}

        {/* Preview toggle */}
        {selectedTemplateId && (
          <div style={sectionStyle}>
            <button
              onClick={() => setShowPreview(!showPreview)}
              style={{
                ...buttonStyle,
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                width: '100%',
              }}
            >
              {showPreview ? 'Hide Preview' : 'Show Preview'}
            </button>
            {showPreview && preview && (
              <div
                style={{
                  marginTop: 12,
                  padding: 12,
                  background: 'var(--bg)',
                  borderRadius: 8,
                  fontSize: 13,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div style={{ ...labelStyle, marginBottom: 4 }}>SMS Preview</div>
                <div style={{ marginBottom: 12 }}>{preview.sms || '(No SMS content)'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {preview.sms_character_count} chars, {preview.sms_segments} segment(s)
                </div>
              </div>
            )}
          </div>
        )}

        {/* Channel */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Send via</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={chipStyle(channel === 'sms')} onClick={() => setChannel('sms')}>
              SMS Only
            </button>
            <button style={chipStyle(channel === 'email')} onClick={() => setChannel('email')}>
              Email Only
            </button>
            <button style={chipStyle(channel === 'both')} onClick={() => setChannel('both')}>
              Both
            </button>
          </div>
        </div>

        {/* Budget warning */}
        {budget && (channel === 'sms' || channel === 'both') && (
          <div
            style={{
              ...sectionStyle,
              background: budget.canSend ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              fontSize: 12,
              color: budget.canSend ? 'var(--green)' : '#EF4444',
            }}
          >
            Daily SMS: {budget.used}/{budget.limit} used
            {!budget.canSend && ' - Limit reached!'}
          </div>
        )}

        {/* Actions */}
        <div
          style={{
            ...sectionStyle,
            display: 'flex',
            gap: 12,
            justifyContent: 'flex-end',
            borderBottom: 'none',
          }}
        >
          <button
            onClick={onClose}
            style={{ ...buttonStyle, background: 'var(--bg)', color: 'var(--text)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={
              sending ||
              (recipientType === 'custom' && selectedPlayerIds.length === 0) ||
              (recipientType === 'group' && !selectedGroupId) ||
              (!selectedTemplateId && !customSms && !customEmailContent)
            }
            style={{
              ...buttonStyle,
              background: 'var(--green)',
              color: 'var(--bg)',
              opacity:
                sending ||
                (recipientType === 'custom' && selectedPlayerIds.length === 0) ||
                (recipientType === 'group' && !selectedGroupId) ||
                (!selectedTemplateId && !customSms && !customEmailContent)
                  ? 0.5
                  : 1,
            }}
          >
            {sending ? 'Sending...' : `Send to ${getRecipientCount()} recipient(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
