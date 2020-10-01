const ProjectModel  = require('./data-models.js').ProjectModel;
const mongoose = require('mongoose');
const UserModel = require('./data-models').UserModel;
const bcrypt = require('bcrypt');
const FileModel = require('../data-service/data-models').FileModel;
const mongodb = require('mongodb');
const fs = require('fs');
const path = require('path');

const uploadsFolder = path.join(__dirname, '../uploads');
module.exports.initialize = () => {
   return new Promise((res,rej) => {
        mongoose.connect(process.env.MONGODB_CONNECTION_STRING, { useNewUrlParser: true, useUnifiedTopology: true });

        const connection = mongoose.connection;

        connection.on('error', err => rej(err));
        connection.once('open', () => 
        {
            res("Successfully connected to the database");
        });
   })
}


module.exports.getMostRecentWorks = () => {
    return new Promise((res, rej) => {
        let query = ProjectModel.find({}, {"data": 0})
                                .sort({dateUploaded: 'desc'})
                                .limit(3);

        query.exec((err, recentUploads) => {
            if(err) rej(err);
            else res(recentUploads);
        })
    });
}

module.exports.getPagedWorks = (requestBody) => {
    return new Promise((res,rej) => {
        let query = ProjectModel.find({"name": {$regex: requestBody.name ? requestBody.name : '' , $options: 'i'},
                                       "authorName": {$regex: requestBody.authorName ?  requestBody.authorName : '', $options: 'i'},
                                       "year": requestBody.year ? requestBody.year : {$exists: true},
                                       "semester": requestBody.semester ? requestBody.semester: {$exists: true}},
                                       {"data": 0})
                                .sort({dateUploaded: 'desc'})
                                .skip(requestBody.skip * requestBody.take)
                                .limit(requestBody.take);
        
        query.exec((err, works) => {
            if(err) rej(err);
            else {
                let countQuery = ProjectModel.countDocuments({"name": {$regex: requestBody.name ? requestBody.name : '' , $options: 'i'},
                                                                "authorName": {$regex: requestBody.authorName ?  requestBody.authorName : '', $options: 'i'},
                                                                "year": requestBody.year ? requestBody.year : {$exists: true},
                                                                "semester": requestBody.semester ? requestBody.semester: {$exists: true}});
                countQuery.exec((err,totalCount) => {
                    if(err) rej(err);
                    else {
                        res({
                            works,
                            totalCount
                        })
                    }
                })
            }
        })
    })
}


module.exports.getWork = (id) => {
    return new Promise((res,rej) => {
        let query = ProjectModel.findById(id);

        query.exec((err,work) => {
            if(err) rej(err);
            else res(work);
        });
    })
}

module.exports.authenticateUser =  (username, password) => {
    return new Promise((res,rej) => {
        try{
            const query = UserModel.findOne({ Login: username });
            query.exec((err,user) => {
                if(err)
                    return rej(err);
                if(user) {
                    const compareResponse = bcrypt.compareSync(password, user.Password);
                    
                    if(compareResponse) {
                        console.log("User" + user + ' successfully Logged In')
                        return res({ success: true, message: 'Successfully Logged In', user});
                    }
                    else {
                        return res({ success: false, message: 'Password is Incorrect' })
                    }
                }
                else {
                    return res({ success: false, message: 'Login or Password is incorrect' })
                }
            });     
        }
        catch(err)  {
            return rej(err);
        }
    })
}

module.exports.getDistinctYears = () => {
    return new Promise((res,rej) => {
        let query = ProjectModel.find({},'year').distinct('year');

        query.exec((err,years) => {
            if(err) rej(err)
            else res(years)
        })
    })
}
module.exports.createNewUser = (login,password) => {
    return new Promise((res,rej) => {

        UserModel.find({Login: login}, (err,users) => {

            if(err) res(false);
            if(users.length === 0) {
                UserModel({
                    Login: login,
                    Password: password
                })
                .save((err, user) => {
                    if(err) rej(err);
                    res("Successfully registered user: " + login);
                })
            }
            else {
                res('Username ' + login + ' already exists :c')
            }
        })
    })
}
module.exports.getUser = (login) => {
    return new Promise((res,rej) => {
        UserModel.findOne({Login: login}, (err, user) => {
            if(err) rej("Error retrieving user: " + login);
            res(user);
        })
    });
}

module.exports.saveWork = (work) => {
    return new Promise( async (res,rej) => {
        if(work._id === 0) {
            let localFileBinary = null;
            let fileExists = false;
            
            if(work.file != undefined && work.file != null) {
                fileExists = true;

                let localFileName = work.file.name + Date.now();
                
                try {
                    let err = await work.file.mv(path.join(uploadsFolder, localFileName));

                    if(err)
                        return rej(err);

                    let localFile = fs.readFileSync(path.join(uploadsFolder, localFileName))
                    
                    localFileBinary = localFile;
                    
                    setTimeout(() => fs.unlinkSync(path.join(uploadsFolder, localFileName)), 10000);
                }
                catch(err) {
                   return rej(err);
                }
            }
            const newProject = ProjectModel({
                                    name: work.name,
                                    sourceLink: work.sourceLink,
                                    authorName: work.authorName,
                                    semester: work.semester,
                                    projectType: work.projectType,
                                    year: work.year,
                                    dateUploaded: Date.now(),
                                    fileName: (fileExists) ? work.file.name : null,
                                    data: (fileExists) ? localFileBinary : null 
                                });

            newProject.save((err, proj) => {
                if(err) return rej(err); 
                else {
                    //console.log("Successfully added record: " + proj.name + ", " + proj.authorName + ", " + proj.sourceLink);
                    return res({success: true})
                }
            })
        }
        else {
            ProjectModel.updateOne({_id: work._id}, {
                        name: work.name,
                        sourceLink: work.sourceLink,
                        authorName: work.authorName,
                        year: work.year,
                        semester: work.semester,
                    })
                    .then(result => {
                        res({success: true})
                    })
                    .catch(err => {
                        console.log(err);
                        rej({err, sucess: false});
                    })
        }
    })
}
module.exports.removeWork = (id) => {
    return new Promise((res,rej) => {
        let query = ProjectModel.deleteOne({_id: id});

        query.exec((err, project) => {
            if(err) rej({err, success: false});
            else res({success: true});
        })
    })
}

module.exports.getFile = (workId) => {
    return new Promise((res,rej) => {
        const query = ProjectModel.findById(workId);

        query.exec((err, file) => {
            if(err) return rej(err);
            else {
                return res(file);
            }
        })

    })
}

module.exports.uploadFile = file => {
    return new Promise((res,rej) => {

        const folderName = path.join(__dirname, '../uploads');

        let localFileName = file.name + Date.now();
        
        try{
            file.mv(path.join(folderName,localFileName)).then(s => {
                
                const localFile = fs.readFileSync(path.join(folderName,localFileName))
                const fileBinary = localFile.toString('base64');

                let newFile = new ProjectModel({authorName: 'azaz', projectType: 'W', fileName: file.name, data: Buffer.from(fileBinary, 'base64') });

                newFile.save((err,succ) => {
                    if(err) console.log('error',err);
                })

            });
        }
        catch(err) {
            console.log(`err`,err);
        }
    })
}