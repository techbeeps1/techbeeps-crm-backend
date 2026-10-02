require('dotenv').config();
const mongoose = require('mongoose');
const Reporting = require('../models/reporting');

async function inspect() {
  await mongoose.connect(process.env.MONGO_URI);
  const items = await Reporting.find({}).lean();
  for (const it of items) {
    console.log(`=== ID: ${it._id} | NAME: "${it.name}" | STATUS: ${it.status} | HTML LEN: ${it.htmlContent ? it.htmlContent.length : 0}`);
    const html = it.htmlContent || '';
    const techbeeps = html.match(/techbeeps/gi);
    if (techbeeps) console.log(`   Found ${techbeeps.length} 'techbeeps' matches`);
    const imgMatches = html.match(/<img[^>]+src=["'][^"']+["']/gi);
    if (imgMatches) console.log(`   Found ${imgMatches.length} images:`, imgMatches.slice(0, 2));
    
    // Check variable placeholders
    const vars = html.match(/\{\{[^}]+\}\}/g);
    if (vars) console.log(`   Sample vars:`, Array.from(new Set(vars)).slice(0, 8));
  }
  process.exit(0);
}

inspect().catch(err => {
  console.error(err);
  process.exit(1);
});
