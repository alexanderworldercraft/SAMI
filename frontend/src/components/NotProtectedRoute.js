const NotProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');

  if (!token || token === 'undefined') {
    console.log("n'a pas de token");
  }

  return children;
};

export default NotProtectedRoute;