export function generateFamousImportFile(items: {
  sku: string;
  qty: number;
  description?: string;
  warehouse?: string;
  departmentId?: string;
}[]): string {
  const lines: string[] = [];
  const today = new Date();
  const dateStr = `${(today.getMonth() + 1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}/${today.getFullYear()}`;

  for (const item of items) {
    if (item.qty <= 0) continue;

    const line = [
      dateStr.padEnd(10),                                    // Date: pos 1-10
      (item.description || 'INVENTORY SYNC').padEnd(40),     // Description: pos 11-50
      item.sku.padEnd(16),                                   // Product ID: pos 51-66
      (item.warehouse || '01').padEnd(40),                   // Warehouse: pos 67-106
      ''.padEnd(12),                                         // Grower ID: pos 107-118
      item.qty.toFixed(3).padStart(11),                      // Quantity: pos 119-129
      'EA'.padEnd(5),                                        // UOM: pos 130-134
      (item.departmentId || '').padEnd(7),                   // Dept ID: pos 135-141
      ''.padEnd(12),                                         // Lot ID: pos 142-153
      'N'                                                    // Override: pos 154
    ].join('');

    lines.push(line);
  }

  return lines.join('\n');
}