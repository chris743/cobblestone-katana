import { config } from '../../config';
import { RepackOutput } from './interfaces';

function formatIssueLine(item: {
  issueDate: string;
  description: string;
  productId: string;
  warehouse?: string;
  growerBlockId?: string;
  quantity: number;
  uom?: string;
  departmentId?: string;
  lotId?: string;
  override?: string;
}): string {
  return [
    item.issueDate.padEnd(10),                                     // pos 1-10
    (item.description || '').substring(0, 40).padEnd(40),          // pos 11-50
    item.productId.substring(0, 16).padEnd(16),                    // pos 51-66
    (item.warehouse || '').substring(0, 40).padEnd(40),            // pos 67-106
    (item.growerBlockId || '').substring(0, 12).padEnd(12),        // pos 107-118
    (-Math.abs(item.quantity)).toFixed(3).padEnd(11),               // pos 119-129
    (item.uom || '').substring(0, 5).padEnd(5),                    // pos 130-134
    (item.departmentId || '60.01').substring(0, 7).padEnd(7),      // pos 135-141
    (item.lotId || '').substring(0, 12).padEnd(12),                // pos 142-153
    (item.override || ' '),                                         // pos 154
  ].join('');
}

export function buildIssueLines(repacks: RepackOutput[]): string[] {
  const now = new Date();
  const dateStr = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getDate().toString().padStart(2, '0')}/${now.getFullYear()}`;

  return repacks
    .filter(r => r.output > 0)
    .map(r => {
      return formatIssueLine({
        issueDate: dateStr,
        description: `AUTO RELIEVE ${r.sku}`.substring(0, 40),
        productId: r.sku,
        quantity: r.output,
      });
    });
}

export async function postIssueImport(repacks: RepackOutput[]): Promise<{ success: boolean; lineCount: number; error?: string; responseText?: string }> {
  const issueLines = buildIssueLines(repacks);

  if (issueLines.length === 0) {
    return { success: true, lineCount: 0 };
  }

  console.log(`Posting ${issueLines.length} issue lines to FAPI relay at ${config.relay.baseUrl}...`);

  let response: Response;
  try {
    response = await fetch(`${config.relay.baseUrl}/famous/issue-import`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.relay.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lines: issueLines }),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, lineCount: issueLines.length, error: `Relay unreachable: ${msg}` };
  }

  let data: {
    ok?: boolean;
    lineCount?: number;
    famousResponseText?: string;
    stage?: string;
    error?: string;
  };
  try {
    data = await response.json() as typeof data;
  } catch {
    const text = await response.text().catch(() => '');
    return { success: false, lineCount: issueLines.length, error: `Relay returned non-JSON (HTTP ${response.status}): ${text.slice(0, 200)}` };
  }

  if (!data.ok) {
    const msg = data.stage ? `${data.stage}: ${data.error || 'unknown'}` : (data.error || `HTTP ${response.status}`);
    return { success: false, lineCount: issueLines.length, error: msg, responseText: data.famousResponseText };
  }

  return { success: true, lineCount: data.lineCount ?? issueLines.length, responseText: data.famousResponseText };
}
