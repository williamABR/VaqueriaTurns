const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const session = require('express-session');

const port = 3000;

// Configurar EJS como motor de vistas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Configurar sesiones
app.use(session({
    secret: 'clave_secreta', // Cambia esto por una clave más segura
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Cambia a true si usas HTTPS
}));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configurar base de datos SQLite
const db = new sqlite3.Database(':memory:');

// Crear tablas necesarias
db.serialize(() => {
    db.run(`CREATE TABLE turnos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cajero TEXT,
        fecha_inicio TEXT,
        fecha_fin TEXT,
        efectivo_disponible REAL,
        total_tarjetas REAL,
        total_nequi_daviplata REAL,
        venta_total REAL,
        codigo_acceso TEXT
    )`);

    db.run(`CREATE TABLE gastos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno_id INTEGER,
        categoria TEXT,
        monto REAL,
        descripcion TEXT,
        FOREIGN KEY(turno_id) REFERENCES turnos(id)
    )`);
});



// Ruta para la vista principal
app.get('/', (req, res) => {
    res.render('index');
});

// Iniciar el servidor
app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

app.post('/iniciar-turno', (req, res) => {
    const { cajero, efectivo_disponible, total_tarjetas, total_nequi_daviplata, venta_total, categoria, monto, descripcion } = req.body;

    // Registrar el turno
    const fecha_inicio = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    db.run(`INSERT INTO turnos (cajero, fecha_inicio, efectivo_disponible, total_tarjetas, total_nequi_daviplata, venta_total)
            VALUES (?, ?, ?, ?, ?, ?)`,
        [cajero, fecha_inicio, efectivo_disponible, total_tarjetas, total_nequi_daviplata, venta_total],
        function(err) {
            if (err) {
                return console.log(err.message);
            }

            const turno_id = this.lastID;

            // Registrar cada gasto
            for (let i = 0; i < categoria.length; i++) {
                db.run(`INSERT INTO gastos (turno_id, categoria, monto, descripcion)
                        VALUES (?, ?, ?, ?)`,
                    [turno_id, categoria[i], monto[i], descripcion[i]],
                    (err) => {
                        if (err) {
                            console.log(err.message);
                        }
                    });
            }

            res.redirect('/');
        });
});
app.post('/verificar-codigo', (req, res) => {
    const { codigo_acceso } = req.body;
    
    // Suponemos un código fijo en este ejemplo
    const codigo_correcto = "1234";

    if (codigo_acceso === codigo_correcto) {
        req.session.codigoValido = true; // Guardar en la sesión que el código es válido
        res.redirect('/cierres');
    } else {
        res.send('Código incorrecto. <a href="/login">Volver</a>');
    }
});

app.get('/login', (req, res) => {
    res.render('login');
});

// Middleware para proteger rutas
function verificarCodigo(req, res, next) {
    if (req.session.codigoValido) {
        return next();
    } else {
        res.redirect('/login');
    }
}

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).send("Error al cerrar sesión");
        }
        res.redirect('/login');
    });
});


app.get('/cierres', verificarCodigo, (req, res) => {
    db.all(`SELECT id, cajero, fecha_inicio, fecha_fin FROM turnos`, [], (err, rows) => {
        if (err) {
            console.error(err.message);
            res.status(500).send("Error al recuperar los cierres de turno");
            return;
        }
        res.render('cierres', { cierres: rows });
    });
});

app.get('/cierre/:id', verificarCodigo, (req, res) => {
    const turnoId = req.params.id;

    db.get(`SELECT * FROM turnos WHERE id = ?`, [turnoId], (err, turno) => {
        if (err) {
            console.error(err.message);
            res.status(500).send("Error al recuperar el cierre de turno");
            return;
        }

        db.all(`SELECT * FROM gastos WHERE turno_id = ?`, [turnoId], (err, gastos) => {
            if (err) {
                console.error(err.message);
                res.status(500).send("Error al recuperar los gastos del turno");
                return;
            }

            res.render('detalle-cierre', { turno, gastos });
        });
    });
});


