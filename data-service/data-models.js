const mongoose = require('mongoose');
const mongoDb = require('mongodb');

const ProjectSchema = new mongoose.Schema({       
    name: String,
    sourceLink: String,
    projectType: String,
    semester: Number,
    year: Number,
    authorName: String,
    dateUploaded: Date,
    fileName: String,
    data: Buffer
});

const ProjectModel = new mongoose.model('projects', ProjectSchema);

const UserSchema = new mongoose.Schema({        
    Login: String,
    Password: String
});

const UserModel = new mongoose.model('users', UserSchema);

module.exports.ProjectModel = ProjectModel;
module.exports.UserModel = UserModel;