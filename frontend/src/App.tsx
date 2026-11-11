import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import CourseLayout from './pages/CourseLayout'
import CourseOverview from './pages/CourseOverview'
import ConceptPage from './pages/ConceptPage'
import NotFound from './pages/NotFound'
import ReviewPage from './pages/ReviewPage'
import PaperPage from './pages/reader/PaperPage'
import PapersPage from './pages/reader/PapersPage'

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/course/:courseId" element={<CourseLayout />}>
          <Route index element={<CourseOverview />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path=":conceptId" element={<ConceptPage />} />
        </Route>
        <Route path="/papers" element={<PapersPage />} />
        <Route path="/papers/:paperId" element={<PaperPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  )
}
