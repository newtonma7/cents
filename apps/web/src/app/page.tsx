import SignIn from "./sign-in";

export default async function Home({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return <SignIn initialError={typeof error === "string" ? error : ""} />;
}
