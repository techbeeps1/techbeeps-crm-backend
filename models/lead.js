const mongoose = require('mongoose');
const { validatePhoneNumber } = require('../utils/phoneValidator');

const leadSchema = new mongoose.Schema({
    typeOfCustomer:String,
    firstName:String,
    lastName:String,
    gender:String,
    email:String,
    contact: {
        type: String,
        validate: {
            validator: validatePhoneNumber,
            message: 'Please enter a valid telephone/mobile number.'
        }
    },
    mobile: {
        type: String,
        validate: {
            validator: validatePhoneNumber,
            message: 'Please enter a valid mobile number (e.g. 06 12345678 or +31 6 12345678).'
        }
    },
    findUs:String,
    city:String,
    postcode:String,
    taal:String,
    status:{
        type: String,
        default: 'New',
    },
    leadIndex: {
        type: Number,
        index: true,
      },
    
   
});

leadSchema.pre('save', async function () {
    if (this.isNew) {
      try {
        const lastLead = await this.constructor
          .findOne()
          .sort({ leadIndex: -1 });
        this.leadIndex = lastLead ? lastLead.leadIndex + 1 : 1;
      } catch (error) {
        throw error;
      }
    }
  });

module.exports = mongoose.model('Lead', leadSchema);