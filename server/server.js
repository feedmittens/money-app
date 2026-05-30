const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/accounts',     require('./routes/accounts'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/categories',   require('./routes/categories'));
app.use('/api/bills',        require('./routes/bills'));
app.use('/api/budgets',      require('./routes/budgets'));
app.use('/api/networth',     require('./routes/networth'));
app.use('/api/import',       require('./routes/import'));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
