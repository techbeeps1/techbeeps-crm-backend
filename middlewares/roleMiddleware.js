const roleMiddleware = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ msg: 'Unauthorized' });
    }
    const userRole = String(req.user.role || '').toLowerCase();
    // Admin and Superadmin always have full privileges
    if (userRole === 'admin' || userRole === 'superadmin') {
      return next();
    }
    if (Array.isArray(requiredRole)) {
      const allowedRoles = requiredRole.map(r => String(r).toLowerCase());
      if (!allowedRoles.includes(userRole)) {
        return res.status(403).json({ msg: 'Access denied: Insufficient privileges' });
      }
    } else if (userRole !== String(requiredRole).toLowerCase()) {
      return res.status(403).json({ msg: 'Access denied: Insufficient privileges' });
    }
    next();
  };
};

const permissionMiddleware = (moduleName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ msg: 'Unauthorized' });
    }
    const userRole = String(req.user.role || '').toLowerCase();
    if (userRole === 'admin' || userRole === 'superadmin') {
      return next();
    }
    const accessList = req.user.access || [];
    if (!accessList.includes(moduleName)) {
      return res.status(403).json({ msg: `Access denied to module: ${moduleName}` });
    }
    next();
  };
};

roleMiddleware.roleMiddleware = roleMiddleware;
roleMiddleware.permissionMiddleware = permissionMiddleware;

module.exports = roleMiddleware;