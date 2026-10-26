import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import CourseLayout from './pages/CourseLayout'
import CourseOverview from './pages/CourseOverview'
import ConceptPage from './pages/ConceptPage'
import NotFound from './pages/NotFound'

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/course/:courseId" element={<CourseLayout />}>
          <Route index element={<CourseOverview />} />
          <Route path=":conceptId" element={<ConceptPage />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
