import { config } from '../../config';
import { RepackOutput } from './interfaces';

const FAMOUS_URL = config.famous.soapUrl;

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
    (item.departmentId || '60.01').substring(0, 7).padEnd(7),         // pos 135-141
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

async function fapiLogin(): Promise<string> {
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Login xmlns="http://FamousSoftware.com/FamousWebServices">
      <connectto>10.200.1.6</connectto>
      <username>${config.famous.username}</username>
      <password>${config.famous.password}</password>
      <companyname>${config.famous.company}</companyname>
    </Login>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(FAMOUS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://FamousSoftware.com/FamousWebServices/Login',
    },
    body: soapBody,
  });

  if (!response.ok) {
    throw new Error(`FAPI login failed: HTTP ${response.status}`);
  }

  const text = await response.text();
  const match = text.match(/<result>([^<]+)<\/result>/);
  if (!match) {
    throw new Error(`FAPI login failed: no token in response`);
  }

  return match[1];
}

async function fapiLogout(token: string): Promise<void> {
  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Logout xmlns="http://FamousSoftware.com/FamousWebServices">
      <token>${token}</token>
    </Logout>
  </soap:Body>
</soap:Envelope>`;

  await fetch(FAMOUS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://FamousSoftware.com/FamousWebServices/Logout',
    },
    body: soapBody,
  }).catch(err => console.log(`FAPI logout error: ${err}`));
}

async function fapiIssueInventory(token: string, issueLines: string[]): Promise<{ success: boolean; responseText: string }> {
  const payloadText = issueLines.join('\n');

  const fapiDocument = `<?Famous<ProcessingInstructions>
  <Settings>
    <Setting>
      <Key>Version</Key>
      <Value>1.0</Value>
    </Setting>
    <Setting>
      <Key>DocumentType</Key>
      <Value>ICIssueFile</Value>
    </Setting>
  </Settings>
</ProcessingInstructions>?>
<Payload>
${payloadText}
</Payload>`;

  const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
               xmlns:xsd="http://www.w3.org/2001/XMLSchema"
               xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <FAPI xmlns="http://FamousSoftware.com/FamousWebServices">
      <token>${token}</token>
      <xml><![CDATA[
${fapiDocument}
      ]]></xml>
    </FAPI>
  </soap:Body>
</soap:Envelope>`;

  const response = await fetch(FAMOUS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'SOAPAction': 'http://FamousSoftware.com/FamousWebServices/FAPI',
    },
    body: soapBody,
  });

  const responseText = await response.text();
  return { success: response.ok, responseText };
}

export async function postIssueImport(repacks: RepackOutput[]): Promise<{ success: boolean; lineCount: number; error?: string; responseText?: string }> {
  const issueLines = buildIssueLines(repacks);

  if (issueLines.length === 0) {
    return { success: true, lineCount: 0 };
  }

  console.log(`Posting ${issueLines.length} issue lines to Famous FAPI...`);

  let token: string;
  try {
    token = await fapiLogin();
    console.log('FAPI login successful');
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, lineCount: issueLines.length, error: `Login failed: ${msg}` };
  }

  try {
    console.log(`FAPI issue lines (${issueLines.length}):`);
    for (const line of issueLines) {
      console.log(`  [${line}]`);
    }

    const result = await fapiIssueInventory(token, issueLines);
    console.log(`FAPI issue response (full):`);
    console.log(result.responseText);

    if (!result.success) {
      return { success: false, lineCount: issueLines.length, error: `FAPI call failed`, responseText: result.responseText };
    }

    return { success: true, lineCount: issueLines.length, responseText: result.responseText };
  } finally {
    await fapiLogout(token);
    console.log('FAPI logout complete');
  }
}
