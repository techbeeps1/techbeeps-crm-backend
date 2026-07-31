// const Staff = require("../../models/Resources/staff");

// exports.createStaff = async (req, res) => {
//   try {
//     let staff = new Staff();
//     staff.gender = req.body.gender ;
//     staff.firstName = req.body.firstName ;
//     staff.middleName = req.body.middleName ;
//     staff.lastName = req.body.lastName ;
//     staff.language = req.body.language ;
//     staff.dob = req.body.dob ;
//     staff.email = req.body.email ;
//     staff.street = req.body.street ;
//     staff.houseNumber = req.body.houseNumber ;
//     staff.addition = req.body.addition ;
//     staff.postCode = req.body.postCode ;
//     staff.city = req.body.city ;
//     staff.country = req.body.country ;
//     staff.inService = req.body.inService ;
//     staff.outService = req.body.outService ;
//     staff.probation = req.body.probation ;
//     staff.startDate = req.body.startDate ;
//     staff.endDate = req.body.endDate ;
//     staff.type = req.body.type ;
//     staff.hourlyWage = req.body.hourlyWage ;
//     staff.hoursWeek = req.body.hoursWeek ;
//     staff.days = req.body.days ;
//     staff.driverLicense = req.body.driverLicense ;
//     staff.skills = req.body.skills ;

//   staff.save()
//       .then((result) => {
//         res.status(200).json({
//           msg: "data is successfully create!",
//           data: result
//         })
//       })
//   } catch (err) {
//     console.log(err)
//   }
// }

// exports.staffList = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const pageSize = parseInt(req.query.pageSize) || 5;
//     const sortField = 'type';

//     const pipeline = [
//       {
//         $sort: { [sortField]: 1 },
//       },
//       {
//         $skip: (page - 1) * pageSize,
//       },
//       {
//         $limit: pageSize,
//       },
//     ];

//     const staffList = await Staff.aggregate(pipeline);

//     // Count total documents
//     const totalStaff = await Staff.countDocuments();

//     res.json({
//       totalStaff: totalStaff,
//       currentPage: page,
//       totalPages: Math.ceil(totalStaff / pageSize),
//       staffList: staffList,
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ message: 'Server error' });
//   }
// };

// exports.searchedStaff = async (req, res) => {
//   const searchTerm = req.query.searchTerm.toLowerCase();
//   const staffList = await Staff.find()

//   const searchedStaff = staffList.filter((staffData) => {
//     const firstName = staffData.firstName.toLowerCase();
//     return firstName.includes(searchTerm) ;
//   });
//   res.json(searchedStaff); 
// };