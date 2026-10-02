require('dotenv').config();
const mongoose = require('mongoose');
const DocumentTemplate = require('../models/documentTemplateModel');

const R2_LOGO_URL = 'https://pub-5a1825f2dbec4d2eb0b6c533f4b0fa5f.r2.dev/logos/universal_movers_logo.png';

/**
 * Builds clean, printable HTML document layout
 */
function buildDocHtml({ docTitle, docTypeLabel, preambleText, termsText }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${docTitle}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 25px; color: #1e293b; background-color: #ffffff; }
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #3c50e0; padding-bottom: 18px; margin-bottom: 25px; }
    .doc-logo { max-height: 55px; max-width: 240px; object-fit: contain; }
    .company-info { text-align: right; font-size: 12px; line-height: 1.5; color: #475569; }
    .company-name { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 2px; }
    .doc-meta-grid { display: flex; justify-content: space-between; margin-bottom: 25px; gap: 20px; }
    .meta-box { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px; flex: 1; font-size: 13px; line-height: 1.6; }
    .meta-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #3c50e0; margin-bottom: 6px; }
    .doc-heading-row { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 15px; }
    .doc-heading { font-size: 22px; font-weight: 800; color: #0f172a; margin: 0; }
    .doc-badge { background-color: #eff6ff; color: #3c50e0; font-size: 12px; font-weight: 700; padding: 4px 10px; border-radius: 4px; border: 1px solid #bfdbfe; }
    .preamble { font-size: 13px; line-height: 1.6; color: #334155; margin-bottom: 20px; }
    .items-container { margin: 25px 0; }
    .totals-card { margin-left: auto; width: 280px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px 18px; margin-bottom: 25px; font-size: 13px; }
    .total-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .total-row.grand { border-top: 2px solid #3c50e0; margin-top: 8px; padding-top: 8px; font-size: 16px; font-weight: 800; color: #0f172a; }
    .terms-box { background-color: #ffffff; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 25px; font-size: 11px; line-height: 1.6; color: #64748b; }
    .doc-footer { border-top: 1px solid #e2e8f0; margin-top: 25px; padding-top: 12px; text-align: center; font-size: 11px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="doc-header">
    <img src="${R2_LOGO_URL}" alt="{{company.companyName}}" class="doc-logo" />
    <div class="company-info">
      <div class="company-name">{{company.companyName}}</div>
      <div>{{company.companyAddress}}</div>
      <div>{{company.companyState}}, {{company.companyCountry}}</div>
      <div>Email: {{company.companyEmail}} | Tel: {{company.companyPhone}}</div>
      <div>KVK / Reg: {{company.companyRegNumber}} | BTW: {{company.companyVatNumber}}</div>
    </div>
  </div>

  <div class="doc-heading-row">
    <h1 class="doc-heading">${docTitle}</h1>
    <span class="doc-badge">${docTypeLabel}</span>
  </div>

  <div class="doc-meta-grid">
    <div class="meta-box">
      <div class="meta-title">Prepared For:</div>
      <div style="font-weight: 700; color: #0f172a;">{{customer.firstName}} {{customer.lastName}}</div>
      <div>{{customer.address}}</div>
      <div>Email: {{customer.email}}</div>
      <div>Phone: {{customer.phone}}</div>
    </div>
    <div class="meta-box">
      <div class="meta-title">Document Reference:</div>
      <div><strong>Document #:</strong> {{invoice.index}}</div>
      <div><strong>Issue Date:</strong> {{invoice.date}}</div>
      <div><strong>Due / Valid Until:</strong> {{invoice.dueDate}}</div>
      <div><strong>Payment Terms:</strong> Upon Receipt</div>
    </div>
  </div>

  <div class="preamble">
    <p>${preambleText}</p>
  </div>

  <div class="items-container">
    {{items}}
  </div>

  <div class="totals-card">
    <div class="total-row grand">
      <span>Total Amount:</span>
      <span>{{currencySymbol}} {{invoice.total}}</span>
    </div>
  </div>

  ${termsText ? `
  <div class="terms-box">
    <strong>Terms & Notes:</strong>
    <p style="margin: 4px 0;">${termsText}</p>
  </div>
  ` : ''}

  <div class="doc-footer">
    {{company.companyName}} &bull; {{company.companyWebsite}} &bull; {{company.companyEmail}} &bull; Tel: {{company.companyPhone}}
  </div>
</body>
</html>`;
}

/**
 * Builds valid Unlayer design JSON for the Visual Designer
 */
function buildDocDesign({ docTitle, docTypeLabel, preambleText, termsText }) {
  return {
    body: {
      rows: [
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: 'image',
                  values: {
                    src: { url: R2_LOGO_URL, width: 220, height: 48 },
                    align: 'left',
                    altText: 'Universal Movers Logo'
                  }
                },
                {
                  type: 'text',
                  values: {
                    text: `<p style="text-align: right; font-size: 12px; color: #475569; margin: 0;"><strong>{{company.companyName}}</strong><br>{{company.companyAddress}}, {{company.companyState}}<br>{{company.companyEmail}} | {{company.companyPhone}}<br>KVK: {{company.companyRegNumber}} | BTW: {{company.companyVatNumber}}</p>`,
                    textAlign: 'right'
                  }
                }
              ],
              values: {
                backgroundColor: '#ffffff',
                padding: '15px'
              }
            }
          ]
        },
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: 'heading',
                  values: {
                    text: docTitle,
                    headingType: 'h1',
                    textAlign: 'left',
                    color: '#0f172a'
                  }
                },
                {
                  type: 'text',
                  values: {
                    text: `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 14px; margin: 15px 0; font-size: 13px;"><strong>Client:</strong> {{customer.firstName}} {{customer.lastName}} &bull; {{customer.email}}<br><strong>Document Reference:</strong> {{invoice.index}} &bull; <strong>Date:</strong> {{invoice.date}}</div>`,
                    color: '#334155'
                  }
                },
                {
                  type: 'text',
                  values: {
                    text: `<p style="font-size: 13px; color: #334155; line-height: 1.6;">${preambleText}</p>`,
                    color: '#334155'
                  }
                },
                {
                  type: 'text',
                  values: {
                    text: `<div style="margin: 20px 0; padding: 12px; background: #fafafa; border: 1px dashed #cbd5e1; text-align: center; color: #64748b;"><strong>[Itemized Services & Pricing Table]</strong><br>{{items}}</div>`,
                    color: '#475569'
                  }
                },
                {
                  type: 'text',
                  values: {
                    text: `<div style="text-align: right; font-size: 16px; font-weight: bold; color: #0f172a; padding: 10px; border-top: 2px solid #3c50e0;">Total Amount: {{currencySymbol}} {{invoice.total}}</div>`,
                    textAlign: 'right'
                  }
                }
              ],
              values: {
                backgroundColor: '#ffffff',
                padding: '20px'
              }
            }
          ]
        },
        {
          cells: [1],
          columns: [
            {
              contents: [
                {
                  type: 'text',
                  values: {
                    text: `<p style="font-size: 11px; color: #64748b; line-height: 1.5; border-top: 1px solid #e2e8f0; padding-top: 10px;"><strong>Terms & Conditions:</strong><br>${termsText || 'All services are subject to the standard terms and conditions of Universal Movers B.V.'}</p>`,
                    color: '#64748b'
                  }
                },
                {
                  type: 'text',
                  values: {
                    text: `<p style="text-align: center; font-size: 11px; color: #94a3b8; margin: 10px 0 0 0;">{{company.companyName}} &bull; {{company.companyWebsite}} &bull; {{company.companyEmail}}</p>`,
                    textAlign: 'center'
                  }
                }
              ],
              values: {
                backgroundColor: '#ffffff',
                padding: '15px'
              }
            }
          ]
        }
      ],
      values: {
        backgroundColor: '#f8fafc',
        fontFamily: { label: 'Arial', value: 'Arial, Helvetica, sans-serif' }
      }
    },
    schemaVersion: 7
  };
}

const docTemplates = [
  // 1. Fixed Price Quotation (Detailed)
  {
    id: '67370c9590d6f7ff081ad1d5',
    name: 'Fixed Price Quotation (Detailed)',
    documentType: 'quote',
    templateType: 'detailed',
    title: 'Fixed Price Quotation',
    typeLabel: 'QUOTE',
    preamble: 'We are pleased to submit our formal fixed-price moving quotation based on your move inventory and requirements. The pricing below is all-inclusive of professional movers, equipped relocation vehicles, fuel, and transit insurance.',
    terms: 'Quotation remains valid for 14 days from issue date. Price is fixed based on agreed inventory and logistics. Payment terms: 50% deposit upon booking confirmation, balance upon completion.'
  },

  // 2. Standard Relocation Estimate (Detailed)
  {
    id: '673c754b23364d99a5951a27',
    name: 'Standard Relocation Estimate (Detailed)',
    documentType: 'quote',
    templateType: 'detailed',
    title: 'Relocation Cost Estimate',
    typeLabel: 'ESTIMATE',
    preamble: 'Hereby, you receive an itemized relocation cost estimate based on your pre-move survey. This estimate covers full packing, transport, floor protection, and furniture placement at the destination address.',
    terms: 'Estimate based on estimated cubic meters and access conditions. Additional services requested on move day will be calculated at standard hourly rates.'
  },

  // 3. Comprehensive Moving Proposal (Detailed)
  {
    id: '688ca2d1fd6d1d3f3b8c2b20',
    name: 'Comprehensive Moving Proposal (Detailed)',
    documentType: 'quote',
    templateType: 'detailed',
    title: 'Comprehensive Moving Proposal',
    typeLabel: 'PROPOSAL',
    preamble: 'Universal Movers B.V. is delighted to present this comprehensive moving proposal for your upcoming relocation. Our certified movers and fleet ensure seamless, secure transport of your household goods.',
    terms: 'Proposal includes comprehensive transit insurance up to €50,000. Parking permits and hoist lift permits included where specified in the itemized line items.'
  },

  // 4. Commercial Office Move Agreement
  {
    id: '6a0eb16135df8d76a501e028',
    name: 'Commercial Office Move Agreement',
    documentType: 'quote',
    templateType: 'basic',
    title: 'Commercial Office Relocation Agreement',
    typeLabel: 'AGREEMENT',
    preamble: 'This corporate relocation agreement outlines the scope of work for office workstations, IT peripherals, conference facilities, and document storage transfer between corporate facilities.',
    terms: 'Corporate billing terms: Net 30 upon invoice. Server and specialized IT equipment must be disconnected by client IT personnel prior to pack out.'
  },

  // 5. Standard Moving Invoice
  {
    id: '688ca1031d908eecf568a19e',
    name: 'Standard Moving Invoice',
    documentType: 'invoice',
    templateType: 'basic',
    title: 'Official Moving Invoice',
    typeLabel: 'TAX INVOICE',
    preamble: 'Thank you for choosing Universal Movers B.V. Please find your official tax invoice for moving services rendered. Kindly remit payment to our banking details specified on this invoice.',
    terms: 'Payment due within 14 days of invoice date. Please quote Invoice #{{invoice.index}} as payment reference on bank transfers.'
  },

  // 6. Warehouse Storage Rental Invoice
  {
    id: '6761236813848a720f7a64c6',
    name: 'Warehouse Storage Rental Invoice',
    documentType: 'invoice',
    templateType: 'basic',
    title: 'Warehouse Storage Rental Invoice',
    typeLabel: 'STORAGE INVOICE',
    preamble: 'Please find your monthly recurring storage rental invoice for your secure, climate-controlled storage unit at Universal Movers warehouse facilities.',
    terms: 'Monthly storage charges are billed in advance. Minimum rental period: 1 month. Access hours: Monday - Saturday 08:00 - 18:00.'
  },

  // 7. Hourly Rate Moving Invoice
  {
    id: '682330740510fa334a460ecf',
    name: 'Hourly Rate Moving Invoice',
    documentType: 'invoice',
    templateType: 'basic',
    title: 'Hourly Rate Moving Invoice',
    typeLabel: 'HOURLY INVOICE',
    preamble: 'This invoice reflects the actual hours worked, vehicle utilization, and materials supplied for your relocation based on our agreed hourly tariff.',
    terms: 'Hours calculated from arrival on site until completion at destination. Minimum booking time: 3 hours.'
  },

  // 8. Final Settlement Invoice
  {
    id: '6a97e21f93a626caf7416224',
    name: 'Final Settlement Invoice',
    documentType: 'invoice',
    templateType: 'basic',
    title: 'Final Settlement Invoice',
    typeLabel: 'SETTLEMENT INVOICE',
    preamble: 'This final statement summarizes the completed move order, adjusting for preliminary deposits, extra cartons, and additional mover hours authorized on site.',
    terms: 'Final balance due immediately upon delivery receipt. We thank you for trusting Universal Movers B.V.'
  }
];

async function updateDocuments() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  for (const doc of docTemplates) {
    const htmlContent = buildDocHtml({
      docTitle: doc.title,
      docTypeLabel: doc.typeLabel,
      preambleText: doc.preamble,
      termsText: doc.terms
    });

    const htmlDesign = buildDocDesign({
      docTitle: doc.title,
      docTypeLabel: doc.typeLabel,
      preambleText: doc.preamble,
      termsText: doc.terms
    });

    const updated = await DocumentTemplate.findByIdAndUpdate(
      doc.id,
      {
        name: doc.name,
        documentType: doc.documentType,
        templateType: doc.templateType,
        htmlContent,
        htmlDesign
      },
      { returnDocument: 'after' }
    );

    if (updated) {
      console.log(`Updated Document Template: "${doc.name}" (ID: ${doc.id})`);
    } else {
      console.warn(`Could not find Document Template with ID: ${doc.id}`);
    }
  }

  console.log('\nAll 8 Document Templates successfully renamed and configured with professional content and R2 cloud logo.');
  process.exit(0);
}

updateDocuments().catch(err => {
  console.error(err);
  process.exit(1);
});
