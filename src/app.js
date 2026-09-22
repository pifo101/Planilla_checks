require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const indexRoutes = require('./routes/index.routes');
const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const assistantRoutes = require('./routes/assistant.routes');
const accountingRoutes = require('./routes/accounting.routes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    name: 'planilla.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.currentUser = req.session.user || null;
  res.locals.currency = new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
  });
  next();
});

app.use(authRoutes);
app.use(indexRoutes);
app.use('/admin', adminRoutes);
app.use('/asistente', assistantRoutes);
app.use('/contabilidad', accountingRoutes);

app.use((req, res) => {
  res.status(404).render('404', { pageTitle: 'Pagina no encontrada' });
});

app.use((error, req, res, next) => {
  console.error(error);

  if (res.headersSent) {
    return next(error);
  }

  return res.status(500).render('500', {
    pageTitle: 'Error del servidor',
    errorMessage: config.isProduction ? null : error.message,
  });
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`Planilla Checks disponible en http://localhost:${config.port}`);
  });
}

module.exports = app;
