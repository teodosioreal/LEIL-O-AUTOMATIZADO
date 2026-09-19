require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  adminUser: process.env.ADMIN_USER || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'troque-esta-senha'
};
