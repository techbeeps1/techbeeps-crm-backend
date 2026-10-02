require('dotenv').config();
const mongoose = require('mongoose');
const Doc = require('../models/documentTemplateModel');

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  const list = await Doc.find({}).lean();
  for (const d of list) {
    console.log(`=== ID: ${d._id} | NAME: "${d.name}" | DOC_TYPE: ${d.documentType} | TEMPLATE_TYPE: ${d.templateType} | HTML LEN: ${d.htmlContent ? d.htmlContent.length : 0}`);
    const html = d.htmlContent || '';
    const techbeeps = html.match(/techbeeps/gi);
    if (techbeeps) console.log(`   Found ${techbeeps.length} 'techbeeps' matches`);
    const imgMatches = html.match(/<img[^>]+src=["'][^"']+["']/gi);
    if (imgMatches) console.log(`   Images:`, imgMatches.slice(0, 2));
    const clean = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`   Snippet:`, clean.substring(0, 180));
  }
  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
