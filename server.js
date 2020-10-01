require('dotenv').config();
const express = require('express');
const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 9090;
const cors = require('cors');
const ds = require('./data-service/data-service');
const fs = require('fs');
const bcrypt = require('bcrypt');
const bodyParser = require('body-parser');
const JWT = require('jsonwebtoken');
const multer = require('multer');
const GridFsStorage = require('multer-gridfs-storage');
const Grid = require('gridfs-stream');
const methodOverride = require('method-override');
const fileUpload = require('express-fileupload');
const path = require('path');

app.use(cors());
app.use(fileUpload());
app.use(express.static(__dirname))

const storage = multer.diskStorage({
    destination: (req,file,cb) => {
        
        cb(null, 'uploads')
    },
    filename: (req, file, cb) => {
        cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`)
    }
})

const upload = multer({ storage: storage });

function signToken(userId) {
    const expiry = new Date().setTime(new Date().getTime() + 60 * 60 * 1000); //one hour
    const token = JWT.sign({
        iss: 'SenecaCreative',
        sub: userId,
        iat: new Date().getTime(),
        exp: expiry
    }, 'secret');

    return token; ////change to env variable
}

function isValidToken(token) {
    const tokenDecoded = JWT.verify(token, process.env.JWT_KEY);

    if(new Date().getTime() < tokenDecoded.exp) 
        return true;
    else
        return false
}

function refreshToken(req,res,next) {
    const token = req.header('Authorization');
    try {
        if(token && isValidToken(token)) {

            let tokenDecoded = JWT.verify(token, process.env.JWT_KEY);

            const refreshedToken = signToken(tokenDecoded.sub);

            req.token = refreshedToken;
            req.isAuthenticated = true;
        }
        else {
            req.token = null;
            req.isAuthenticated = false;
        }
    }
    catch(e) {
        req.token = null;
        req.isAuthenticated = false;
    }
    return next();
}

function validateRefreshToken(req,res,next) {
    const token = req.header('Authorization');

    if(token) {
        if(isValidToken(token)) {
            return refreshToken(req,res,next)
        }
        else {
            return res.json({isAuthenticated: false, token: null, redirect: true});
        }
    }
    else {
        return res.json({isAuthenticated: false, token: null, redirect: true});
    }
}

app.get('/', (req,res) => {
    res.send("Hello world");
})

app.use(bodyParser.json());

app.post('/works/pagedWorks', refreshToken, (req,res) => {
    ds.getPagedWorks(req.body).then(r => res.json({isAuthenticated: req.isAuthenticated, token: req.token, data: r}))
        .catch(err => { console.log(err); res.sendStatus(500) })
})

app.get('/works/recentworks', refreshToken, (req,res) => {
    ds.getMostRecentWorks().then(recentUploads => res.json({isAuthenticated: req.isAuthenticated, token: req.token, data: recentUploads}))
        .catch(err => { console.log(err); res.sendStatus(500) });
})

app.get('/works/distinctYears', refreshToken, (req, res) => {
    ds.getDistinctYears().then(r => res.json({isAuthenticated: req.isAuthenticated, token: req.token, data: r}))
        .catch(err => {console.log(err); res.sendStatus(500)});
})
app.get('/work/:id', refreshToken, (req,res) => {
    ds.getWork(req.params.id).then(work => res.json({isAuthenticated: req.isAuthenticated, token: req.token, data: work}))
        .catch(err => { console.log(err); res.sendStatus(500)} );
})

app.post('/work/remove', validateRefreshToken, (req,res) => {
    const id = req.body._id;
    ds.removeWork(id)
        .then(r => {
            res.json({ isAuthenticated: req.isAuthenticated, token: req.token, data: r })
        })
        .catch(err => {
            console.log(err);
            res.json({ isAuthenticated: req.isAuthenticated, token: req.token, data: r })
        })
})

app.post('/work/save', validateRefreshToken, (req,res) => {
    ds.saveWork(convertToWorkSaveRequst(req)).then(r => res.json({isAuthenticated: req.isAuthenticated, token: req.token, data: r}))
        .catch(e => console.log(e));
})

function convertToWorkSaveRequst(req) {
    return {
        ...(typeof req.body.work == 'string' ? JSON.parse(req.body.work) : req.body.work),
        file: (req.files && req.files.file) ? req.files.file : null
    }
} 

app.post('/registerUser', validateRefreshToken, (req,res) => {
    const password = req.body.password;
    const login = req.body.login;
    
    bcrypt.genSalt(Number(process.env.HASHROUNDS))
        .then(salt => {
            bcrypt.hash(password, salt, (err, hash) => {
                if(err) 
                    console.log(err);
                else 
                    ds.createNewUser(login, hash)
                        .then(success => res.json({isAuthenticated: req.isAuthenticated, token: req.token, data: success}))
                        .catch(fail => console.log(fail));
            })
        })
        .catch(err => console.log(err))
})
app.post('/login', (req,res) => {
    const login = req.body.login;
    const password = req.body.password;
    ds.authenticateUser(login, password).then(r => {
        
        if(r && r.success) {
            res.json({ isAuthenticated: true, token: signToken(r.user._id), data: { loggedIn: true, message: r.message } })
        }
        else {
            res.json({ isAuthenticated: false, token: null, data: { loggedIn: false, message: r.message} })
        }
    })
    .catch(err => {
        console.log(err);
        res.status(500).send(err);
    });
})

app.post('/work/upload', (req,res) => {
    if(req.files != undefined && req.files.file != null && req.files.file != undefined) {
        
        const file = req.files.file;

        ds.uploadFile().then(r => res.json(r))
            .catch(e => res.json(e))
    }
})

app.get('/work/getFile/:id', refreshToken, (req,res) => {
    ds.getFile('5eb8be0c475eed5685a69024').then(r => res.json({isAuthenticated: req.isAuthenticated, token: req.token, data: r }))
        .catch(e => console.log('getfile err', e));
})

app.listen(HTTP_PORT,() => {
    console.log("Express server listening on port: " + HTTP_PORT);

    console.log("Connecting to the DB...");

    ds.initialize().then(r => console.log(r))
    .catch(e => console.log(e));
})