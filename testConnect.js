const mongoose = require('mongoose');
mongoose.connect(process.env.MONGODB_URI)
  .then(()=> { console.log('Connected OK'); process.exit(0); })
  .catch(e=> { console.error('Connect error', e); process.exit(1); });