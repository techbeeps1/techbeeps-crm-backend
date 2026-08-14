const Task = require('../models/taskModel');
const User = require('../models/user')
const nodemailer = require('nodemailer');
const EmailTemplate = require('../models/reporting');

// Create a new task
// Create a transporter for Nodemailer
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


exports.createTask = async (req, res) => {
    try {
        const taskData = req.body;
        const task = new Task(taskData);
        // await task.save();
        const teamMembers = taskData.teamMembers;  // teamMembers is assumed to be an array of ObjectId(s)
        const users = await User.find({ '_id': { $in: teamMembers } });
        const emailTemplate = await EmailTemplate.findById("677bc309a951e7a4ba54e249");
        if (!emailTemplate) {
            return res.status(404).send('Email template not found');
        }
        let emailHtml = emailTemplate.htmlContent;
        const teamMembersList = users.map(user => `<li>${user.username} (${user.email})</li>`).join('');
        emailHtml = emailHtml.replace(/{{\s*task.teamMembers\s*}}/g, `<ul>${teamMembersList}</ul>`);

        for (const user of users) {
            let data = {
                user: user,
                task: task
            };
            let userEmailHtml = emailHtml;
            userEmailHtml = userEmailHtml.replace(/{{\s*(\w+(\.\w+)*)\s*}}/g, (match, key) => {
                return key.split('.').reduce((obj, prop) => obj && obj[prop], data) || '';
            });
            const mailOptions = {
                from: process.env.SMTP_USER, // Sender email address
                to: user.email,  // Send to each user's email
                subject: `New Task Assigned to ${user.username}`,
                html: userEmailHtml  // Send the HTML content as the email body
            };
            await transporter.sendMail(mailOptions);
            await task.save();
        }
        res.status(201).json({ message: 'Task created successfully and emails sent', task });
    } catch (error) {
        res.status(400).json({ message: 'Error creating task', error: error.message });
    }
};

// Get all tasks
exports.getTasks = async (req, res) => {
    try {
        const { scheduledFor,jobId } = req.query; // Get the scheduledFor parameter from query
        let filter = {}; // Default filter (no filter applied)
        if (jobId) {
            filter.job = jobId; // Filter for specific jobId
        }
        if (scheduledFor === 'today') {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);  // Set to midnight
            const endOfDay = new Date(startOfDay);
            endOfDay.setHours(23, 59, 59, 999); // Set to the last millisecond of the day
            filter.scheduledFor = { $gte: startOfDay.toISOString(), $lt: endOfDay.toISOString() }; // Filter for today
        }
        else if (scheduledFor === 'tomorrow') {
            const startOfTomorrow = new Date();
            startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);  // Move to tomorrow
            startOfTomorrow.setHours(0, 0, 0, 0);  // Set to midnight
            const endOfTomorrow = new Date(startOfTomorrow);
            endOfTomorrow.setHours(23, 59, 59, 999); // Set to the last millisecond of the day
            filter.scheduledFor = { $gte: startOfTomorrow.toISOString(), $lt: endOfTomorrow.toISOString() }; // Filter for tomorrow
        }
        else if (scheduledFor === 'ever') {
            filter = {}; // No filter on scheduledFor, return all tasks
        }
        else if (scheduledFor) {
            const specificDate = new Date(scheduledFor);
            specificDate.setHours(0, 0, 0, 0);  // Set to midnight of the specific date
            const endOfSpecificDate = new Date(specificDate);
            endOfSpecificDate.setHours(23, 59, 59, 999); // Set to the last millisecond of the day
            filter.scheduledFor = { $gte: specificDate.toISOString(), $lt: endOfSpecificDate.toISOString() }; // Filter by specific date
        }
        const tasks = await Task.find(filter)
            .populate({
                path: 'customer',
                populate: {
                    path: 'address',
                    match: { addressType: 'head' }, // Only populate address with type 'head'
                },
            })
            .populate('job', 'relocation index')
            .sort({ createdAt: -1 });
        res.status(200).json(tasks);
    } catch (error) {
        res.status(400).json({ message: 'Error fetching tasks', error: error.message });
    }
};

// Update a task
exports.updateTask = async (req, res) => {
    try {
        const { id } = req.params;
        const updatedTask = await Task.findByIdAndUpdate(id, req.body, { new: true });
        if (!updatedTask) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(200).json({ message: 'Task updated successfully', task: updatedTask });
    } catch (error) {
        res.status(400).json({ message: 'Error updating task', error: error.message });
    }
};

// Delete a task
exports.deleteTask = async (req, res) => {
    try {
        const { id } = req.params;
        const deletedTask = await Task.findByIdAndDelete(id);
        if (!deletedTask) {
            return res.status(404).json({ message: 'Task not found' });
        }
        res.status(200).json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting task', error: error.message });
    }
};
