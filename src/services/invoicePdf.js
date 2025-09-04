// src/services/invoicePdf.js
const PDFDocument = require('pdfkit');

const CURRENCY = process.env.PDF_CURRENCY || 'TL';
// currency AFTER amount (e.g., "20.00 TL")
const money = (v) => `${Number(v || 0).toFixed(2)} ${CURRENCY}`;
const defined = (v, fb) => (v !== undefined && v !== null ? v : fb);

function renderInvoice(res, order) {
  // normalize totals
  const subFromTotals = order.totals && order.totals.subTotal;
  const shippingFromTotals =
    order.totals &&
    (order.totals.shipping !== undefined
      ? order.totals.shipping
      : order.totals.shippingCost);
  const taxFromTotals = order.totals && order.totals.tax;
  const discountFromTotals = order.totals && order.totals.discount;
  const grandFromTotals =
    order.totals &&
    (order.totals.grandTotal !== undefined
      ? order.totals.grandTotal
      : undefined);

  const subtotal = Number(defined(order.subtotal, defined(subFromTotals, 0)));
  const shipping = Number(defined(order.shipping, defined(shippingFromTotals, 0)));
  const tax      = Number(defined(order.tax,      defined(taxFromTotals, 0)));
  const discount = Number(defined(order.discount, defined(discountFromTotals, 0)));
  const grandTotal = Number(
    defined(order.grandTotal, defined(grandFromTotals, subtotal - discount + tax + shipping))
  );

  // PDF
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const fname = `invoice-${order.orderNo || order._id}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fname}"`);
  doc.pipe(res);

  const pageRight = doc.page.width - doc.page.margins.right;

  /* Header */
  doc.font('Helvetica-Bold').fontSize(28).text('INVOICE', 50, 50);
  doc
    .font('Helvetica')
    .fontSize(11)
    .text(`Order: ${order.orderNo || order._id}`, 320, 56, { width: pageRight - 320, align: 'right' })
    .text(`Date: ${new Date(order.createdAt).toLocaleString()}`, 320, 72, { width: pageRight - 320, align: 'right' });

  doc
    .moveTo(50, 95)
    .lineTo(pageRight, 95)
    .strokeColor('#9aa0a6')
    .lineWidth(0.8)
    .stroke();

  /* Address block */
  const a = order.shippingAddress || {};
  const name = [a.firstName, a.lastName].filter(Boolean).join(' ') || '-';

  doc.font('Helvetica-Bold').fontSize(16).text('Billing / Shipping', 50, 112);

  doc.font('Helvetica').fontSize(12);
  const addrLines = [
    name,
    a.line1 || '',
    a.line2 || '',
    [a.city, a.province, a.postalCode].filter(Boolean).join(', '),
    a.country || ''
  ].filter(Boolean);

  let y = 136;
  addrLines.forEach((line) => {
    // slightly looser leading
    doc.text(line, 50, y, { width: 380 });
    y += 18;
  });

  // EXTRA breathing room below address
  y += 20;

  /* Items table */
  // "Items" label
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#000').text('Items', 50, y);
  y += 12; // gap after label

  const tableLeft  = 50;
  const tableRight = pageRight;
  const tableWidth = tableRight - tableLeft;
  const gap = 10;

  const wSku  = 170;
  const wQty  = 42;
  const wUnit = 80;
  const wLine = 90;
  let wTitle = Math.max(120, tableWidth - (wSku + wQty + wUnit + wLine + gap * 4));

  const col = {
    sku:   { x: tableLeft,                                 w: wSku   },
    title: { x: tableLeft + wSku + gap,                    w: wTitle },
    qty:   { x: tableLeft + wSku + gap + wTitle + gap,     w: wQty   },
    unit:  { x: tableLeft + wSku + gap + wTitle + gap + wQty + gap, w: wUnit  },
    line:  { x: tableLeft + wSku + gap + wTitle + gap + wQty + gap + wUnit + gap, w: wLine  },
  };

  // ensure within printable area
  const lastRight = col.line.x + col.line.w;
  if (lastRight > tableRight) {
    const overflow = lastRight - tableRight;
    wTitle = Math.max(100, wTitle - overflow);
    col.title.w = wTitle;
    col.qty.x   -= overflow;
    col.unit.x  -= overflow;
    col.line.x  -= overflow;
  }

  // header row
  doc.font('Helvetica-Bold').fontSize(11);
  const headerTopY = y;
  doc.text('SKU',   col.sku.x,   headerTopY, { width: col.sku.w });
  doc.text('Title', col.title.x, headerTopY, { width: col.title.w });
  doc.text('Qty',   col.qty.x,   headerTopY, { width: col.qty.w,  align: 'center' });
  doc.text('Unit',  col.unit.x,  headerTopY, { width: col.unit.w, align: 'right' });
  doc.text('Line',  col.line.x,  headerTopY, { width: col.line.w, align: 'right' });

  const headerLineY = headerTopY + doc.currentLineHeight() + 4;
  doc
    .moveTo(tableLeft, headerLineY)
    .lineTo(tableRight, headerLineY)
    .strokeColor('#000')
    .lineWidth(1)
    .stroke();

  y = headerLineY + 8;

  // rows
  doc.font('Helvetica').fontSize(11);
  const items = Array.isArray(order.items) ? order.items : [];
  const baseRowH = 20;

  items.forEach((it) => {
    const qty  = Number(it.qty || 0);
    const unit = Number(it.unitPrice || 0);
    const line = qty * unit;

    const hSku   = doc.heightOfString(String(it.sku || ''),   { width: col.sku.w });
    const hTitle = doc.heightOfString(String(it.title || ''), { width: col.title.w });
    const rowH   = Math.max(baseRowH, hSku, hTitle);

    doc.text(String(it.sku || ''),   col.sku.x,   y, { width: col.sku.w });
    doc.text(String(it.title || ''), col.title.x, y, { width: col.title.w });
    doc.text(String(qty),            col.qty.x,   y, { width: col.qty.w,  align: 'center' });
    // money() now returns "20.00 TL" and we still right-align it
    doc.text(money(unit),            col.unit.x,  y, { width: col.unit.w, align: 'right' });
    doc.text(money(line),            col.line.x,  y, { width: col.line.w, align: 'right' });

    const rowBottom = y + rowH;
    doc
      .moveTo(tableLeft, rowBottom)
      .lineTo(tableRight, rowBottom)
      .strokeColor('#e6e6e6')
      .lineWidth(0.6)
      .stroke();

    y = rowBottom + 2;
  });

  /* Totals */
  y += 14;
  const boxW = 235;
  const boxLeft = tableRight - boxW;
  const boxRight = tableRight;

  doc.moveTo(boxLeft, y).lineTo(boxRight, y).strokeColor('#000').lineWidth(1).stroke();
  y += 10;

  const totalRow = (label, value, bold = false, lh = 18) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.text(label, boxLeft, y, { width: boxW - 110 });
    // right-aligned total values; money() gives amount then currency (e.g., "129.00 TL")
    doc.text(value, boxLeft, y, { width: boxW, align: 'right' });
    y += lh;
  };

  totalRow('Subtotal', money(subtotal));
  if (discount > 0) {
    totalRow(`Discount${order.couponCode ? ` (${order.couponCode})` : ''}`, `- ${money(discount)}`);
  }
  totalRow('Shipping', money(shipping));
  totalRow('Tax', money(tax));

  doc.moveTo(boxLeft, y + 2).lineTo(boxRight, y + 2).strokeColor('#000').lineWidth(1).stroke();
  y += 10;
  totalRow('Total', money(grandTotal), true, 22);

  // Footer
  y += 14;
  doc.font('Helvetica-Oblique').fontSize(10).fillColor('#666')
     .text('Thank you for your purchase!', 50, y);

  doc.end();
}

module.exports = { renderInvoice };
