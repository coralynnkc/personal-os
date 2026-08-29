import DocClient from '@/components/week/DocClient'

export const metadata = { title: 'Planning doc — Personal OS' }

export default async function DocPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return <DocClient slug={slug} />
}
