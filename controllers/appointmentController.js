const Appointment = require('../models/appointmentModel'); // Adjust path as needed

exports.createAppointment = async (req, res) => {
    try {
        const { 
            jobId, date, startTime, endTime, appointmentType, 
            departureTime, arrivalTime, workLocation, departureLocation, 
            notes, id, ...extraFields // Capture dynamic fields here and the id for update
        } = req.body;
        const appointmentData = {
            jobId,
            date,
            startTime,
            endTime,
            appointmentType,
            departureTime,
            arrivalTime,
            workLocation,
            departureLocation,
            notes,
            additionalFields: extraFields // Store dynamic fields in additionalFields
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
            res.status(201).json(newAppointment);  // Return the newly created appointment
        }
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


exports.getAppointments = async (req, res) => {
    try {
        const { jobId, date } = req.query;
        let formattedDate = null;
        if (date) {
            const inputDate = new Date(date); // Parse the provided date string
            formattedDate = new Date(inputDate.setHours(0, 0, 0, 0)).toISOString(); // Start of the day in UTC
        }
        const query = { jobId };
        if (formattedDate) {
            query.date = { $gte: formattedDate, $lt: new Date(new Date(formattedDate).setDate(new Date(formattedDate).getDate() + 1)).toISOString() };
        }
        const appointments = await Appointment.find(query);
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
    try {
        const appointment = await Appointment.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });
        if (!appointment) return res.status(404).json({ message: "Appointment not found" });
        res.status(200).json(appointment);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.deleteAppointment = async (req, res) => {
    try {
        const appointment = await Appointment.findByIdAndDelete(req.params.id);
        if (!appointment) return res.status(404).json({ message: "Appointment not found" });
        res.status(200).json({ message: "Appointment deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
