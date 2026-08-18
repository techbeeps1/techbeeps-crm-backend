const Appointment = require('../models/appointmentModel'); // Adjust path as needed
const Employability = require('../models/employabilityModel'); // Adjust path as needed


exports.createAppointment = async (req, res) => {
    try {
        const { 
            jobId, date, startTime, endTime, appointmentType, 
             workLocation, departureLocation,
             assignedEmployees,

            notes, id, ...extraFields // Capture dynamic fields here and the id for update
        } = req.body;



        const employabilityRecords = assignedEmployees.map(emp => ({
            employeeId: emp.employeeId,
            employeeName: emp.employeeName,
            workType: emp.workType,
            startTime: emp.startTime,
            endTime: emp.endTime,
            vehicle: emp.vehicle || null, // Assign vehicle if provided, else null

        }));
        const savedEmployability = await Employability.insertMany(employabilityRecords);

        const appointmentData = {
            jobId,
            date,
            startTime,
            endTime,
            appointmentType,
            workLocation,
        
            departureLocation,
            assignedEmployees: savedEmployability.map(emp => emp._id), // Store the IDs of the employability records
            notes,
            
        };
        let newAppointment;
        if (id) {
            newAppointment = await Appointment.findByIdAndUpdate(id, appointmentData, { new: true });
            if (!newAppointment) {
                return res.status(404).json({ message: 'Appointment not found' });
            }
           
            res.status(200).json(newAppointment);  // Return the updated appointment
        } else {
            newAppointment = new Appointment(appointmentData);
            await newAppointment.save();
           // Convert startTime to India time
            res.status(201).json(newAppointment);  // Return the newly created appointment
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

function toISTISOString(date) {
  const d = new Date(date);

  // IST = UTC +5:30
  const ist = new Date(d.getTime() + (5.5 * 60 * 60 * 1000));

  return ist.toISOString().replace("Z", "+05:30");
}

exports.getAppointments = async (req, res) => {
  try {
    const appointments = await Appointment.find();

    res.status(200).json(appointments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};



exports.getAppointmentById = async (req, res) => {
    try {
        const appointment = await Appointment.findById(req.params.id);
        if (!appointment) return res.status(404).json({ message: "Appointment not found" });
        res.status(200).json(appointment);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateAppointment = async (req, res) => {
  const appointmentId = req.params.id;

  try {
    const {
      jobId,
      date,
      startTime,
      endTime,
      appointmentType,
      workLocation,
      departureLocation,
      assignedEmployees,
      notes,
    } = req.body;

    // Find existing appointment
    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found",
      });
    }

    // Delete old employability records
    if (
      appointment.assignedEmployees &&
      appointment.assignedEmployees.length
    ) {
      await Employability.deleteMany({
        _id: { $in: appointment.assignedEmployees },
      });
    }

    // Create new employability records
    const employabilityRecords = assignedEmployees.map((emp) => ({
      employeeId: emp.employeeId,
      employeeName: emp.employeeName,
      workType: emp.workType,
      startTime: emp.startTime,
      endTime: emp.endTime,
      vehicle: emp.vehicle || null,
    }));

    const savedEmployability = await Employability.insertMany(
      employabilityRecords
    );

    // Update appointment
    appointment.jobId = jobId;
    appointment.date = date;
    appointment.startTime = startTime;
    appointment.endTime = endTime;
    appointment.appointmentType = appointmentType;
    appointment.workLocation = workLocation;
    appointment.departureLocation = departureLocation;
    appointment.notes = notes;
    appointment.assignedEmployees = savedEmployability.map(
      (item) => item._id
    );

    await appointment.save();

    res.status(200).json({
      message: "Appointment updated successfully",
      appointment,
    });
  } catch (error) {
    res.status(500).json({
      message: error.message,
    });
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findById(req.params.id);

    if (!appointment) {
      return res.status(404).json({
        message: "Appointment not found",
      });
    }

    // Delete related Employability records
    if (
      appointment.assignedEmployees &&
      appointment.assignedEmployees.length > 0
    ) {
      await Employability.deleteMany({
        _id: { $in: appointment.assignedEmployees },
      });
    }

    // Delete Appointment
    await Appointment.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success:true,  
      message: "Appointment and related employability records deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
        success:false,
      message: error.message,
    });
  }
};