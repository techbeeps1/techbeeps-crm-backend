const roleMiddleware = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ msg: 'Unauthorized' });
    }
    // Admin always has full privileges
    if (req.user.role === 'Admin') {
      return next();
    }
    if (Array.isArray(requiredRole)) {
      if (!requiredRole.includes(req.user.role)) {
        return res.status(403).json({ msg: 'Access denied: Insufficient privileges' });
      }
    } else if (req.user.role !== requiredRole) {
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
    if (req.user.role === 'Admin') {
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