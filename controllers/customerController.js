const Customer = require("../models/customer");
const Address = require('../models/addressModel');
const { validatePhoneNumber } = require('../utils/phoneValidator');

exports.customer = async (req, res) => {
  try {
    // Validate required name fields are not whitespace-only
    const firstName = typeof req.body.firstName === 'string' ? req.body.firstName.trim() : '';
    const lastName = typeof req.body.lastName === 'string' ? req.body.lastName.trim() : '';
    if (!firstName) {
      return res.status(400).json({ error: 'First name cannot be blank or spaces only.' });
    }
    if (!lastName) {
      return res.status(400).json({ error: 'Last name cannot be blank or spaces only.' });
    }

    if (req.body.mobile && !validatePhoneNumber(req.body.mobile)) {
      return res.status(400).json({ error: 'Please enter a valid mobile number (e.g. 06 12345678 or +31 6 12345678).' });
    }
    if (req.body.contact && !validatePhoneNumber(req.body.contact)) {
      return res.status(400).json({ error: 'Please enter a valid telephone number (e.g. 010 1234567 or +31 10 1234567).' });
    }

    // check customer exist or not
    const existingCustomer = await Customer.findOne({ email: req.body.email });
    if (existingCustomer) {
      return res.status(400).json({ error: 'Customer with this email already exists' });
    }else {

    const newAddress = new Address(req.body?.head);
    const savedAddress = await newAddress.save();
    const customerData = { ...req.body, address: savedAddress._id }; // Add the address ID to the customer data
    const newCustomer = new Customer(customerData);
    await newCustomer.save();
    res.status(200).json({ message: 'customer created', customerID: newCustomer._id });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error)
  }
};

exports.addAddressToCustomer = async (req, res) => {
  try {
    const { customerId, addressData } = req.body;
    if (!customerId || !addressData) {
      return res.status(400).json({ error: 'Customer ID and Address Data are required' });
    }
    const newAddress = new Address(addressData);
    const savedAddress = await newAddress.save();
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      { $push: { address: savedAddress._id } }, // Push new address ID into address array
      { new: true, runValidators: true } // Return updated customer document
    );
    if (!updatedCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.status(200).json({
      message: 'Address added and linked to customer successfully',
    });
  } catch (error) {
    console.error('Error adding address:', error);
    res.status(500).json({ error: 'Failed to add address to customer' });
  }
};

exports.getHeadAddress = async (req, res) => {
  try {
    const { Id } = req.params;
 
    const addresses = await Address.find({ _id: Id });
  if (!addresses || addresses.length === 0) {
      return res.status(404).json({ success: false, error: 'Head address not found' });
    }
    res.status(200).json({success: true, address: addresses[0] });


  } catch (error) {
   
    res.status(500).json({ error: 'Failed to retrieve head address', error: error.message });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    const { customerId, addressId } = req.body;
    if (!customerId || !addressId) {
      return res.status(400).json({ error: 'Customer ID and Address ID are required' });
    }
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      { $pull: { address: addressId } }, // Remove the address ID from the array
      { new: true }
    );
    if (!updatedCustomer) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    const deletedAddress = await Address.findByIdAndDelete(addressId);
    if (!deletedAddress) {
      return res.status(404).json({ error: 'Address not found' });
    }
    res.status(200).json({
      message: 'Address deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting address:', error);
    res.status(500).json({ error: 'Failed to delete address' });
  }
};


exports.updateAddress = async (req, res) => {
  try {
    const data = req.body;
    if (!data._id) {
      return res.status(400).json({ error: 'Address ID required' });
    }
    const updatedAddress = await Address.findByIdAndUpdate(
      data._id,
      { $set: data }, // Update fields with the new data
      { new: true, runValidators: true } // Return updated document and validate changes
    );
    if (!updatedAddress) {
      return res.status(404).json({ error: 'Address not found' });
    }
    res.status(200).json({
      message: 'Address updated successfully',
    });
  } catch (error) {
    console.error('Error updating address:', error);
    res.status(500).json({ error: 'Failed to update address' });
  }
};

exports.customerList = async (req, res) => {
  try {
    const typeFilter = req.query.type; // Get the type filter from query params
    const filter = {};
    if (typeFilter) {
      filter.type = typeFilter;
    }
    const customersList = await Customer.find(filter).populate('address', 'country').sort({ customerIndex: 1 });
    res.json({
      customers: customersList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};


exports.customerCount = async (req, res) => {
  try {
    const totalCustomers = await Customer.countDocuments();
    res.json({ totalCustomers });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.CustomerDetail = async (req, res) => {
  const { id } = req.body
  try {
    const customer = await Customer.findById(id).populate('address');
    res.json({ customer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const dataCheck = await Customer.findById(customerId);
    if (dataCheck) {
      const JobSchedule = require('../models/jobSchedule');
      const Invoice = require('../models/invoice');

      const linkedJobsCount = await JobSchedule.countDocuments({ customer: customerId });
      const linkedInvoicesCount = await Invoice.countDocuments({ customer: customerId });

      if (linkedJobsCount > 0 || linkedInvoicesCount > 0) {
        // Dependency-aware customer archival: Preserve document history and relational integrity
        dataCheck.status = 'Inactive';
        await dataCheck.save();
        return res.status(200).send({
          status: true,
          msg: `Customer has active dependencies (${linkedJobsCount} linked jobs, ${linkedInvoicesCount} invoices). Customer has been archived as Inactive to preserve relational integrity.`,
          archived: true,
          dependencies: {
            jobs: linkedJobsCount,
            invoices: linkedInvoicesCount
          }
        });
      }

      await Address.findByIdAndDelete(dataCheck.address);
      const DeleteData = await Customer.findOneAndDelete({ _id: dataCheck._id });
      res.status(200).send({
        status: true,
        msg: "DATA is successfully deleted",
      });
    } else {
      return res
        .status(404)
        .send({ status: false, msg: "Customer is not found", data: null });
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send({ status: false, msg: "Internal server error", data: null });
  }
};

exports.editCustomer = async (req, res) => {
  try {
    const customerId = req.params.customerId || req.body._id;
    if (!customerId) {
      return res.status(400).json({ error: 'Customer ID is required for update.' });
    }

    const existingCustomer = await Customer.findById(customerId);
    if (!existingCustomer) {
      return res.status(404).json({ error: 'Customer not found with the provided ID.' });
    }

    // Sanitize payload: never overwrite immutable identifiers or internal metadata
    const updatePayload = { ...req.body };
    delete updatePayload._id;
    delete updatePayload.__v;
    delete updatePayload.createdAt;
    delete updatePayload.updatedAt;
    delete updatePayload.customerIndex;

    // Preserve existing address reference unless an explicit valid address ID is provided
    if (!updatePayload.address || typeof updatePayload.address === 'object') {
      delete updatePayload.address;
    }

    if (updatePayload.mobile && !validatePhoneNumber(updatePayload.mobile)) {
      return res.status(400).json({ error: 'Please enter a valid mobile number (e.g. 06 12345678 or +31 6 12345678).' });
    }
    if (updatePayload.contact && !validatePhoneNumber(updatePayload.contact)) {
      return res.status(400).json({ error: 'Please enter a valid telephone number (e.g. 010 1234567 or +31 10 1234567).' });
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      { $set: updatePayload },
      { new: true, runValidators: true }
    ).populate('address');

    if (!updatedCustomer) {
      return res.status(500).json({ error: 'Customer update failed unexpectedly.' });
    }

    res.status(200).json({
      status: true,
      msg: 'Customer updated successfully',
      data: updatedCustomer,
    });
  } catch (err) {
    console.error('Error updating customer:', err);
    if (err.code === 11000) {
      return res.status(400).json({
        error: 'Duplicate entry: A customer with this email or identity already exists.',
      });
    }
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        error: messages.join(', ') || 'Validation failed for customer data.',
      });
    }
    res.status(500).json({ error: err.message || 'Internal server error during customer update.' });
  }
};

exports.mergeCustomer = async (req, res) => {
  try {
    // Get the IDs of the original customer and the customer to be merged
    const originalCustomerId = req.body.originalCustomerId;
    const selectedCustomerId = req.body.selectedCustomerId;

    // Fetch the original customer and the selected customer from the database
    const originalCustomer = await Customer.findById(originalCustomerId);
    const selectedCustomer = await Customer.findById(selectedCustomerId);

    // Check if both customers exist
    if (!originalCustomer || !selectedCustomer) {
      return res.status(404).json({ success: false, message: 'User ID is invalid or not foun' });
    }

    // Merge the address from the selected customer into the original customer
    // work is pending for merging other fields all 
    originalCustomer.address = selectedCustomer.address; // Assuming 'address' is a property of the Customer schema

    // Save the updated customer data
    const updatedCustomer = await originalCustomer.save();

    res.status(200).json({ success: true, message: 'Customer data merged successfully', data: updatedCustomer });
  } catch (error) {
    
    console.error('Error merging customers:', error);
    res.status(500).json({ success: false, message: 'User ID is invalid or not found' });
  }
};

exports.searchedCustomer = async (req, res) => {
  const searchTerm = req.query.searchTerm.toLowerCase();
  const customersList = await Customer.find();
  const filteredCustomers = customersList.filter((customer) => {
    const firstName = customer.firstName.toLowerCase();
    const lastName = customer.lastName.toLowerCase();
    const fullName = `${firstName} ${lastName}`.toLowerCase();
    const contact = customer.contact ? customer.contact.toString().toLowerCase() : '';

    return firstName.includes(searchTerm) || lastName.includes(searchTerm) || fullName.includes(searchTerm) || contact.includes(searchTerm);
  });
  res.json(filteredCustomers);
};

// Filter the customer list based on the search term
//   try {
//   const filteredCustomers = await Customer.find({
//     $or: [
//       { firstName: { $regex: searchTerm, $options: 'i' } },
//       { postcode: { $regex: searchTerm, $options: 'i' } },
//       { contact: { $regex: searchTerm, $options: 'i' } },
//       { city: { $regex: searchTerm, $options: 'i' } },
//       { email: { $regex: searchTerm, $options: 'i' } },
//     ],
//   },

//     {
//       firstName: 1,
//       postcode: 1,
//       contact: 1,
//       city: 1,
//       email: 1

//   });
//   console.log("filteredCustomers", filteredCustomers);
//   res.json(filteredCustomers);
// } catch (error) {
//   console.error('Error searching customers:', error);
//   res.status(500).json({ message: 'Server error' });
// }
// };

