const mongoose = require('mongoose');
const Task = require('../models/taskModel');
const User = require('../models/user');
const nodemailer = require('nodemailer');
const EmailTemplate = require('../models/reporting');
const CompanyDetails = require('../models/companyModel');
const { renderEmailTemplate } = require('../utils/emailTemplateUtil');

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
        const taskData = { ...req.body };

        // Sanitize ObjectId fields: remove empty strings, 'null', 'undefined'
        if (taskData.job && typeof taskData.job === 'object' && taskData.job._id) {
            taskData.job = taskData.job._id;
        }
        if (!taskData.job || taskData.job === '' || taskData.job === 'undefined' || taskData.job === 'null' || !mongoose.Types.ObjectId.isValid(taskData.job)) {
            delete taskData.job;
        }
        if (taskData.customer && typeof taskData.customer === 'object' && taskData.customer._id) {
            taskData.customer = taskData.customer._id;
        }
        if (!taskData.customer || taskData.customer === '' || taskData.customer === 'undefined' || taskData.customer === 'null' || !mongoose.Types.ObjectId.isValid(taskData.customer)) {
            delete taskData.customer;
        }
        if (taskData.teams && Array.isArray(taskData.teams)) {
            taskData.teams = taskData.teams.filter(tid => tid && tid !== '');
        }
        if (taskData.directMembers && Array.isArray(taskData.directMembers)) {
            taskData.directMembers = taskData.directMembers.filter(mid => mid && mid !== '');
        }

        // Normalize scheduledFor to UTC midday of the target calendar date (UM-029)
        if (taskData.scheduledFor) {
            const dateStr = typeof taskData.scheduledFor === 'string'
                ? taskData.scheduledFor.slice(0, 10)
                : new Date(taskData.scheduledFor).toISOString().slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                taskData.scheduledFor = new Date(`${dateStr}T12:00:00.000Z`);
            }
        }

        const task = new Task(taskData);
        await task.save();

        const teamMembers = taskData.teamMembers;
        if (teamMembers && Array.isArray(teamMembers) && teamMembers.length > 0) {
            try {
                const users = await User.find({ '_id': { $in: teamMembers } });
                const company = await CompanyDetails.findOne();
                const emailTemplate = await EmailTemplate.findById("677bc309a951e7a4ba54e249");
                if (emailTemplate && users && users.length > 0) {
                    let rawHtml = emailTemplate.htmlContent;
                    const teamMembersList = users.map(user => `<li>${user.username} (${user.email})</li>`).join('');
                    rawHtml = rawHtml.replace(/{{\s*task.teamMembers\s*}}/g, `<ul>${teamMembersList}</ul>`);

                    for (const user of users) {
                        const userEmailHtml = renderEmailTemplate(rawHtml, {
                            company,
                            customer: user,
                            user,
                            task,
                            data: { user, task },
                        });
                        const mailOptions = {
                            from: `"${company?.companyName || 'Universal Movers'}" <${process.env.SMTP_USER}>`,
                            replyTo: company?.companyEmail || 'info@universal-movers.nl',
                            to: user.email,
                            subject: `New Task Assigned to ${user.username}`,
                            html: userEmailHtml
                        };
                        await transporter.sendMail(mailOptions);
                    }
                }
            } catch (emailErr) {
                console.error("Error sending task notification emails:", emailErr.message);
            }
        }

        res.status(201).json({ message: 'Task created successfully', task });
    } catch (error) {
        res.status(400).json({ message: 'Error creating task', error: error.message });
    }
};

// Get all tasks
exports.getTasks = async (req, res) => {
    try {
        const { scheduledFor, jobId } = req.query; // Get the scheduledFor parameter from query
        let filter = {}; // Default filter (no filter applied)
        if (jobId) {
            filter.job = jobId; // Filter for specific jobId
        }
        if (scheduledFor === 'today') {
            const now = new Date();
            const y = now.getFullYear();
            const m = now.getMonth();
            const d = now.getDate();
            const startOfDay = new Date(Date.UTC(y, m, d, 0, 0, 0));
            const endOfDay = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
            filter.scheduledFor = { $gte: startOfDay, $lte: endOfDay };
        }
        else if (scheduledFor === 'tomorrow') {
            const now = new Date();
            now.setDate(now.getDate() + 1);
            const y = now.getFullYear();
            const m = now.getMonth();
            const d = now.getDate();
            const startOfTomorrow = new Date(Date.UTC(y, m, d, 0, 0, 0));
            const endOfTomorrow = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
            filter.scheduledFor = { $gte: startOfTomorrow, $lte: endOfTomorrow };
        }
        else if (scheduledFor === 'ever' || scheduledFor === 'all') {
            filter = {}; // No filter on scheduledFor, return all tasks
        }
        else if (scheduledFor) {
            let y, m, d;
            if (typeof scheduledFor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) {
                [y, m, d] = scheduledFor.split('-').map(Number);
                m = m - 1;
            } else {
                const parsed = new Date(scheduledFor);
                y = parsed.getFullYear();
                m = parsed.getMonth();
                d = parsed.getDate();
            }
            const specificStart = new Date(Date.UTC(y, m, d, 0, 0, 0));
            const specificEnd = new Date(Date.UTC(y, m, d, 23, 59, 59, 999));
            filter.scheduledFor = { $gte: specificStart, $lte: specificEnd };
        }

        // Role-based filtering: Non-admins only see tasks assigned to them
        if (req.user && req.user.role !== 'Admin') {
            const Team = require('../models/Resources/team');
            let userTeamIds = [];
            try {
                const userTeams = await Team.find({ members: req.user.userId }, '_id');
                userTeamIds = userTeams.map(t => t._id);
            } catch (teamErr) {
                console.warn('Error fetching user teams for task filtering:', teamErr.message);
            }

            const assignmentConditions = [
                { directMembers: req.user.userId },
                { teamMembers: req.user.userId }
            ];

            if (req.user.username) {
                const escapedName = req.user.username.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                assignmentConditions.push({
                    assignedTo: { $regex: new RegExp(escapedName, 'i') }
                });
            }

            if (userTeamIds.length > 0) {
                assignmentConditions.push({ teams: { $in: userTeamIds } });
            }

            filter.$and = filter.$and || [];
            filter.$and.push({ $or: assignmentConditions });
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
            .populate('teamMembers', 'username email')
            .populate('teams', 'teamName members')
            .populate('directMembers', 'username email')
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
        const updateData = { ...req.body };

        // UM3-124: Preserve existing Job and Customer relations on partial updates
        // Extract _id if passed as populated object
        if (updateData.job && typeof updateData.job === 'object' && updateData.job._id) {
            updateData.job = updateData.job._id;
        }
        if (updateData.customer && typeof updateData.customer === 'object' && updateData.customer._id) {
            updateData.customer = updateData.customer._id;
        }

        // Only unlink if explicitly requested (e.g. unlinkJob: true or clearJob: true)
        if (req.body.unlinkJob === true || req.body.clearJob === true) {
            updateData.job = null;
        } else if (
            updateData.job === undefined ||
            updateData.job === '' ||
            updateData.job === 'undefined' ||
            updateData.job === 'null' ||
            !mongoose.Types.ObjectId.isValid(updateData.job)
        ) {
            // Omit from update payload so MongoDB preserves the existing linked job
            delete updateData.job;
        }

        if (req.body.unlinkCustomer === true || req.body.clearCustomer === true) {
            updateData.customer = null;
        } else if (
            updateData.customer === undefined ||
            updateData.customer === '' ||
            updateData.customer === 'undefined' ||
            updateData.customer === 'null' ||
            !mongoose.Types.ObjectId.isValid(updateData.customer)
        ) {
            // Omit from update payload so MongoDB preserves the existing linked customer
            delete updateData.customer;
        }

        if (updateData.teams && Array.isArray(updateData.teams)) {
            updateData.teams = updateData.teams.filter(tid => tid && tid !== '');
        }
        if (updateData.directMembers && Array.isArray(updateData.directMembers)) {
            updateData.directMembers = updateData.directMembers.filter(mid => mid && mid !== '');
        }
        if (updateData.scheduledFor) {
            const dateStr = typeof updateData.scheduledFor === 'string'
                ? updateData.scheduledFor.slice(0, 10)
                : new Date(updateData.scheduledFor).toISOString().slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                updateData.scheduledFor = new Date(`${dateStr}T12:00:00.000Z`);
            }
        }
        const updatedTask = await Task.findByIdAndUpdate(id, updateData, { new: true })
            .populate('job', 'relocation index')
            .populate('customer');

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
