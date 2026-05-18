// const mongoose = require('mongoose');

// const UserSchema = new mongoose.Schema({
//   username: {type:String, unique:true},
//   password: String,
// }, {timestamps: true});

// const UserModel = mongoose.model('usercs', UserSchema);
// module.exports = UserModel;


const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username : { type: String},
  email: { type: String, required: true, unique: true},
  password: { type: String, required: true },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },  // Add the role field with a default value
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
